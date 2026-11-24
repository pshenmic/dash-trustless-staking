import type { Pool, PoolMeta } from './types'

/**
 * A pool with its display metadata applied. The name is always present: a pool without a creator-chosen
 * one is anonymous rather than nameless, so every screen can render a heading without a special case.
 */
export type DisplayPool = Pool & {
  name: string
  description: string
  /** The creator retired this pool; it stays readable and completable, just marked and sorted last */
  archived: boolean
  /** The name stored in the pool document itself, before any poolMeta override — generation 2 leaves it out */
  documentName?: string
  /** The description stored in the pool document itself, before any poolMeta override */
  documentDescription?: string
}

/** Six base58 characters of a 44-character pool id: unique in practice, and the same prefix the URL and Details tab show. */
export function anonymousPoolName (poolId: string): string {
  return `Anonymous Pool #${poolId.slice(0, 6)}`
}

/**
 * Metadata is append-only, so the creator's newest document is the current one; older ones stay on
 * Platform as an audit trail. Only the creator's documents count — anyone can publish a poolMeta,
 * and a stranger must not be able to rename someone else's pool.
 */
export function latestCreatorMeta (metas: PoolMeta[], creatorId: string): PoolMeta | null {
  let latest: PoolMeta | null = null
  for (const meta of metas) {
    if (meta.ownerId !== creatorId) continue
    if (latest == null || meta.createdAt >= latest.createdAt) latest = meta
  }
  return latest
}

/** The creator's title, then the pool document's own name (generation 1), then the anonymous fallback. */
export function poolDisplayName (pool: Pick<Pool, 'id' | 'name'>, meta: PoolMeta | null = null): string {
  const named = meta?.name ?? pool.name
  return named != null && named.trim() !== '' ? named : anonymousPoolName(pool.id)
}

export function poolDisplayDescription (pool: Pick<Pool, 'description'>, meta: PoolMeta | null = null): string {
  return meta?.description ?? pool.description ?? ''
}

/** Applies the creator's newest metadata to a pool document, field by field: an omitted field falls back to the document. */
export function withDisplayMeta (pool: Pool, metas: PoolMeta[] = []): DisplayPool {
  const meta = latestCreatorMeta(metas, pool.ownerId)
  return {
    ...pool,
    name: poolDisplayName(pool, meta),
    description: poolDisplayDescription(pool, meta),
    archived: meta?.archived === true,
    ...(pool.name != null ? { documentName: pool.name } : {}),
    ...(pool.description != null ? { documentDescription: pool.description } : {})
  }
}