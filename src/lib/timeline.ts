/** A row of the pool feed: a chat message or an activity event. */
export interface FeedEntry {
  /** Milliseconds since the epoch, or null when the entry describes chain state rather than a moment */
  at: number | null
}

/**
 * Chronological order for the pool feed, oldest first. Entries without a timestamp describe the
 * pool's current chain state instead of a moment, so they sort after everything that has one.
 */
export function compareFeed (a: FeedEntry, b: FeedEntry): number {
  if (a.at == null) return b.at == null ? 0 : 1
  if (b.at == null) return -1
  return a.at - b.at
}