import { DashCoreSDK } from 'dash-core-sdk'
import { decode } from 'cbor2'
import { fromHex, toHex } from '../../lib/bytes'
import { parseMnListDiff, SimplifiedMNList, type MnListEntry } from '../../lib/mnlist'
import { parseOutputs } from '../../lib/transaction'
import type { Outpoint } from '../../lib/types'
import type { ChainSource } from '../types'

const REQUEST_TIMEOUT_MS = 6_000
const REQUEST_ATTEMPTS = 3
const RESUBSCRIBE_DELAY_MS = 2_000

/**
 * The connection pool hands out a random DAPI node per call and some of them accept the request and
 * never answer. Without a deadline those promises never settle, which wedges any Promise.all using
 * them (the lock dialog's "checking members' UTXOs" step). Every call gets a deadline and a retry on
 * another node.
 */
async function withDeadline<T> (call: () => Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      call(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

async function resilient<T> (what: string, call: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
    try {
      return await withDeadline(call, what)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${what} failed`)
}

function toMasternode (entry: MnListEntry | null): { proTxHash: string, isValid: boolean, service: string } | null {
  if (entry == null) return null
  return { proTxHash: entry.proTxHash, isValid: entry.isValid, service: entry.service ?? '' }
}

/**
 * Chain access over DAPI Core. Transactions come from `getTransaction` (so the node needs `txindex=1`);
 * the masternode list is the chainlocked `protx diff` stream, CBOR-encoded, merged as diffs arrive.
 */
export function createLiveChain (dapiUrls: string[] = []): ChainSource {
  const sdk = new DashCoreSDK(dapiUrls.length > 0 ? { network: 'testnet', dapiUrl: dapiUrls[0] } : { network: 'testnet' })
  const masternodes = new SimplifiedMNList()
  let subscribed = false

  const subscribe = (): void => {
    if (subscribed) return
    subscribed = true

    void (async () => {
      try {
        for await (const response of sdk.subscribeToMasternodeList().responses) {
          const bytes = response.masternodeListDiff
          if (bytes == null || bytes.byteLength === 0) continue
          masternodes.apply(parseMnListDiff(decode(bytes) as Record<string, unknown>))
          if (masternodes.needsResync) {
            subscribed = false
            subscribe()
            return
          }
        }
      } catch {
        subscribed = false
        await new Promise(resolve => setTimeout(resolve, RESUBSCRIBE_DELAY_MS))
        subscribe()
      }
    })()
  }

  // Transactions are immutable, so one lookup per txid is enough however many of its outputs are checked
  const txCache = new Map<string, { raw: Uint8Array, height: number } | null>()

  const transaction = async (txid: string): Promise<{ raw: Uint8Array, height: number } | null> => {
    if (txCache.has(txid)) return txCache.get(txid) ?? null

    let result: { raw: Uint8Array, height: number } | null = null

    try {
      const tx = await resilient(`getTransaction ${txid}`, async () => await sdk.getTransaction(txid))
      result = { raw: tx.transaction, height: tx.height }
    } catch {
      result = null
    }

    if (result != null) txCache.set(txid, result)
    return result
  }

  const output = async (outpoint: Outpoint) => {
    const tx = await transaction(outpoint.txid)
    if (tx == null) return null
    return parseOutputs(tx.raw)[outpoint.vout] ?? null
  }

  return {
    getBestBlockHeight: async () => (await resilient('getBestBlockHeight', async () => await sdk.getBestBlockHeight())).height,

    async getTransaction (txid) {
      const tx = await transaction(txid)
      return tx == null ? null : { txid, height: tx.height > 0 ? tx.height : null }
    },

    async getOutputValue (outpoint) {
      const prevout = await output(outpoint)
      return prevout == null ? null : prevout.value
    },

    async getPrevout (outpoint) {
      const prevout = await output(outpoint)
      return prevout == null ? null : { script: toHex(prevout.script), value: prevout.value }
    },

    async getMasternode (proTxHash) {
      subscribe()
      return toMasternode(masternodes.get(proTxHash))
    },

    async getMasternodeByOperatorKey (operatorPubKey) {
      subscribe()
      return toMasternode(masternodes.byOperatorKey(operatorPubKey))
    },

    async getRegisteredHeight (proTxHash) {
      const tx = await transaction(proTxHash)
      return tx == null || tx.height === 0 ? null : tx.height
    },

    async getMasternodeListHeight () {
      subscribe()
      return masternodes.height
    },

    async broadcastTransaction (hex) {
      const response = await resilient('broadcastTransaction', async () => await sdk.broadcastTransaction(fromHex(hex)))
      return response.transactionId
    }
  }
}