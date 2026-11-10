const STORAGE_KEY = 'dts:dissolutions'

/*
 * A dissolution is a plain transaction, not a Platform document, and DAPI cannot report whether a
 * utxo is spent. The one fact the app knows and the chain does not yet show is "this browser
 * broadcast a dissolution for this pool". Remember it until the chainlocked masternode list drops
 * the entry, so the pool reads as dissolving rather than as a broken masternode.
 */

function read (): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed != null && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

function write (value: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage unavailable: the pool simply falls back to the chain-derived status
  }
}

/** The ProDisTx this browser broadcast for the pool, if any */
export function pendingDissolution (poolId: string): string | null {
  return read()[poolId] ?? null
}

export function markDissolutionBroadcast (poolId: string, txid: string): void {
  write({ ...read(), [poolId]: txid })
}

export function clearDissolution (poolId: string): void {
  const all = read()
  if (all[poolId] == null) return
  delete all[poolId]
  write(all)
}
