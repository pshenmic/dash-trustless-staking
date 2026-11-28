import type { DashscanAddressTx } from '../lib/economics'
import type { DashscanBlock, DashscanMasternode, DashscanSnapshot, DashscanTransaction } from '../lib/stats'

/*
 * Dashscan's public API, called straight from the browser (it answers `access-control-allow-origin: *`).
 * Only the /stats page uses it, and only after the visitor presses the button.
 */

const TIMEOUT_MS = 20_000
const PAGE_SIZE = 100

interface Page<T> {
  resultSet: T[]
  pagination?: { page: number, limit: number, total: number }
}

export function dashscanHost (network: string): string {
  return network === 'mainnet' ? 'https://dashscan.pshenmic.dev' : 'https://testnet.dashscan.pshenmic.dev'
}

async function getJson<T> (url: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`Dashscan answered ${response.status}`)
    return await response.json() as T
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Dashscan did not answer in time')
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pagination is ascending, one-based and page*limit based, so the newest rows are the last page —
 * computed from the total the first request reports.
 */
async function newestPage<T> (host: string, path: string, size = PAGE_SIZE): Promise<T[]> {
  const first = await getJson<Page<T>>(`${host}${path}?limit=1`)
  const total = first.pagination?.total ?? first.resultSet.length
  const page = Math.max(1, Math.ceil(total / size))
  const last = await getJson<Page<T>>(`${host}${path}?limit=${size}&page=${page}`)
  return last.resultSet
}

export async function fetchDashscanSnapshot (host: string): Promise<DashscanSnapshot> {
  const [masternodes, blocks, transactions, supply] = await Promise.all([
    // Any explicit `limit` is rejected on this route; the default page already holds the whole list
    getJson<Page<DashscanMasternode>>(`${host}/masternodes`).then(page => page.resultSet),
    newestPage<DashscanBlock>(host, '/blocks'),
    newestPage<DashscanTransaction>(host, '/transactions'),
    getJson<{ totalSupply: string }>(`${host}/supply`)
  ])
  return {
    masternodes,
    blocks,
    transactions,
    totalSupply: supply.totalSupply ?? '0',
    fetchedAt: Date.now()
  }
}

/**
 * An address's transactions, walking backwards from the newest page until the page's oldest entry is
 * older than `since`. Ascending list, so the newest rows are the last page.
 */
export async function fetchAddressTransactions (host: string, address: string, since: number, maxPages = 2): Promise<DashscanAddressTx[]> {
  const path = `/address/${encodeURIComponent(address)}/transactions`
  const first = await getJson<Page<DashscanAddressTx>>(`${host}${path}?limit=1`)
  const total = first.pagination?.total ?? 0
  if (total === 0) return []

  const collected: DashscanAddressTx[] = []
  let page = Math.max(1, Math.ceil(total / PAGE_SIZE))
  for (let i = 0; i < maxPages && page >= 1; i++, page--) {
    const chunk = await getJson<Page<DashscanAddressTx>>(`${host}${path}?limit=${PAGE_SIZE}&page=${page}`)
    collected.push(...chunk.resultSet)
    let oldest = Infinity
    for (const tx of chunk.resultSet) {
      const at = Date.parse(tx.timestamp)
      if (!Number.isNaN(at) && at < oldest) oldest = at
    }
    if (oldest < since) break
  }
  return collected
}

/** One masternode's owner keys: `keyIDOwner` for a plain node, every share's `keyIDOwner` for a shared one */
export interface MasternodeOwnerRow {
  proTxHash: string
  owners: string[]
}

const OWNERS_TTL_MS = 5 * 60_000
/** A failed probe is remembered briefly, so a pool page polling every few seconds does not hammer it */
const OWNERS_FAILURE_TTL_MS = 60_000
const OWNERS_TIMEOUT_MS = 3_000

let ownerRows: { at: number, rows: MasternodeOwnerRow[] | null, ttl: number } | null = null

/**
 * Every registered masternode's owner keys. This is the only client-reachable index of share owner
 * keys — a `protx diff` entry carries `keyIDVoting` but never `keyIDOwner`.
 *
 * Returns null when the index is unreachable: the check built on it is optional, so a caller must
 * treat null as "not checked", never as "nothing is taken".
 */
export async function fetchMasternodeOwnerRows (host: string): Promise<MasternodeOwnerRow[] | null> {
  const now = Date.now()
  if (ownerRows != null && now - ownerRows.at < ownerRows.ttl) return ownerRows.rows

  try {
    const page = await getJson<Page<DashscanMasternode>>(`${host}/masternodes`, OWNERS_TIMEOUT_MS)
    const rows = page.resultSet.map(row => ({
      proTxHash: String(row.proTxHash).toLowerCase(),
      owners: String(row.ownerAddress ?? '').split(',').map(address => address.trim()).filter(address => address !== '')
    }))
    ownerRows = { at: now, rows, ttl: OWNERS_TTL_MS }
    return rows
  } catch {
    ownerRows = { at: now, rows: null, ttl: OWNERS_FAILURE_TTL_MS }
    return null
  }
}