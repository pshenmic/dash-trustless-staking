import { Transaction } from 'dash-core-sdk'
import { fromHex } from './bytes'
import { keyIdToAddress, scriptToAddress } from './address'
import type { Duffs, Network } from './types'

/*
 * The on-chain share table is the authoritative one: a ProUpShareTx can change a share's reward script
 * after registration, while the Platform join document stays immutable. Reading it means fetching the
 * ProRegTx and decoding its payload, because the simplified masternode list carries no shares.
 */

export interface OnchainShare {
  index: number
  amount: Duffs
  ownerAddress: string
  /** null means "the refund script" — Core stores an empty reward script */
  rewardAddress: string | null
  refundAddress: string | null
}

export interface OnchainShares {
  proTxHash: string
  votingAddress: string | null
  shares: OnchainShare[]
}

export function parseOnchainShares (hex: string, network: Network = 'testnet'): OnchainShares | null {
  let tx: Transaction
  try {
    tx = Transaction.fromHex(hex)
  } catch {
    return null
  }

  const payload = (tx as unknown as {
    extraPayload?: {
      keyIDVoting?: string
      shares?: Array<{
        amount: bigint
        scriptRefund: { bytes: () => Uint8Array } | null
        scriptReward: { bytes: () => Uint8Array } | null
        getOwnerAddress: (n: string) => string
      }>
    }
  }).extraPayload
  if (payload?.shares == null || payload.shares.length === 0) return null

  return {
    proTxHash: tx.hash(),
    votingAddress: payload.keyIDVoting != null ? keyIdToAddress(fromHex(payload.keyIDVoting), network) : null,
    shares: payload.shares.map((share, index) => {
      const reward = share.scriptReward?.bytes() ?? new Uint8Array()
      const refund = share.scriptRefund?.bytes() ?? new Uint8Array()
      return {
        index,
        amount: Number(share.amount),
        ownerAddress: share.getOwnerAddress(network),
        rewardAddress: reward.length > 0 ? scriptToAddress(reward, network) : null,
        refundAddress: refund.length > 0 ? scriptToAddress(refund, network) : null
      }
    })
  }
}