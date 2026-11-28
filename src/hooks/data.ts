import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { backend, platformFor } from '../data'
import {
  fetchCreatorProfile, fetchHomeStats, fetchMyActivity, fetchOnchainShareOwners, fetchPoolState, fetchPoolSummaries, fetchProposalSentiment, fetchGovernanceStats, fetchStatsSource,
  type ActionKind, type CreatorProfile, type OnchainOwnersResult, type PoolState, type PoolSummary, type ProposalSentiment, type StatsSource
} from '../data/queries'
import type { GovernanceStats } from '../lib/governanceStats'
import type { HostingOptions } from '../data/types'
import type { Feedback, Join, Message, Pool, PoolMeta, Vote } from '../lib/types'
import type { HomeStats } from '../lib/homeStats'
import { useNetwork } from '../lib/network'
import { isProposalHash } from '../lib/voting'
import { GENERATIONS, useGeneration } from '../generations'

/*
 * Every contract-scoped query keys by generation slug as well as by its own argument, so the two
 * generations never share a cache entry. The platform source comes from the route's generation.
 */

export function usePoolSummaries (): UseQueryResult<PoolSummary[]> {
  const { ref } = useGeneration()
  return useQuery({
    queryKey: ['pools', ref.slug],
    queryFn: async () => await fetchPoolSummaries(platformFor(ref)),
    refetchInterval: 30_000
  })
}

/**
 * Owner keys held by live masternodes, from an optional index. A failed read carries its reason and
 * every consumer must skip its check then — a failure is never "nothing is taken".
 */
export function useOnchainShareOwners (): UseQueryResult<OnchainOwnersResult> {
  return useQuery({
    queryKey: ['onchain-share-owners'],
    queryFn: fetchOnchainShareOwners,
    staleTime: 5 * 60_000,
    // The provider is optional: a failure is the answer "unknown", not something to retry
    retry: false
  })
}

/**
 * Landing-page numbers: documents give the totals, the already-streamed masternode list gives the
 * running count. `running` stays null until the list has synced, so the tile can say "syncing"
 * instead of claiming zero.
 */
export function useHomeStats (): { stats: HomeStats | null, running: number | null, isLoading: boolean, error: unknown } {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  const stats = useQuery({
    queryKey: ['home-stats', ref.slug],
    queryFn: async () => await fetchHomeStats(platform),
    staleTime: 5 * 60_000,
    refetchInterval: 60_000
  })
  const operators = stats.data?.lockedOperators ?? []
  const running = useQuery({
    queryKey: ['home-running', ref.slug, operators],
    enabled: operators.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const height = await backend.chain.getMasternodeListHeight()
      if (height == null) return null
      const entries = await Promise.all(operators.map(async key => await backend.chain.getMasternodeByOperatorKey(key)))
      return entries.filter(entry => entry != null && entry.isValid).length
    }
  })
  return {
    stats: stats.data ?? null,
    // No locked pools means nothing can be running, but only say so once the documents have loaded
    running: stats.data == null ? null : operators.length === 0 ? 0 : running.data ?? null,
    isLoading: stats.isLoading,
    error: stats.error
  }
}

/** The stats page's documents. Slower moving than the grid, so it can afford a five-minute cache */
export function useStatsSource (): UseQueryResult<StatsSource> {
  const { ref } = useGeneration()
  return useQuery({
    queryKey: ['stats-source', ref.slug],
    queryFn: async () => await fetchStatsSource(platformFor(ref)),
    staleTime: 5 * 60_000,
    refetchInterval: 60_000
  })
}

/** The grid's cached summary for this pool: instant header and join numbers before any query resolves */
export function usePoolPreview (poolId: string): PoolSummary | null {
  const client = useQueryClient()
  const { ref } = useGeneration()
  return client.getQueryData<PoolSummary[]>(['pools', ref.slug])?.find(s => s.pool.id === poolId) ?? null
}

export function usePoolDocument (poolId: string): UseQueryResult<Pool | null> {
  const client = useQueryClient()
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['pool-doc', ref.slug, poolId],
    queryFn: async () => await platform.getPool(poolId),
    staleTime: 20_000,
    placeholderData: () => client.getQueryData<PoolSummary[]>(['pools', ref.slug])?.find(s => s.pool.id === poolId)?.pool
  })
}

/**
 * The pool's full state. The pool page polls it; the pools grid asks once per card that has a stored
 * visit, to decide whether anything changed — same query key, so opening that pool reuses the answer.
 */
export function usePoolState (poolId: string, options: { enabled?: boolean, poll?: boolean } = {}): UseQueryResult<PoolState | null> {
  const queryClient = useQueryClient()
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['pool', ref.slug, poolId],
    queryFn: async () => {
      // same key and function as usePoolDocument, so react-query shares one in-flight request
      const pool = await queryClient.fetchQuery({
        queryKey: ['pool-doc', ref.slug, poolId],
        queryFn: async () => await platform.getPool(poolId),
        staleTime: 20_000
      })
      return await fetchPoolState(poolId, pool, platform)
    },
    enabled: options.enabled ?? true,
    // Poll faster while the pool is moving through signing and confirmation
    refetchInterval: options.poll === false
      ? false
      : query => query.state.data?.status === 'SIGNING' ? 4_000 : 20_000
  })
}

export function useMessages (channel: string): UseQueryResult<Message[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['messages', ref.slug, channel],
    queryFn: async () => await platform.listMessages(channel),
    refetchInterval: 8_000
  })
}

export function useFeedback (poolId: string): UseQueryResult<Feedback[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({ queryKey: ['feedback', ref.slug, poolId], queryFn: async () => await platform.listFeedback(poolId) })
}

/** Display metadata, oldest first; the newest from the pool creator is the one that counts */
export function usePoolMetas (poolId: string): UseQueryResult<PoolMeta[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({ queryKey: ['pool-metas', ref.slug, poolId], queryFn: async () => await platform.listPoolMetas(poolId) })
}

export function useVotes (poolId: string, enabled = true): UseQueryResult<Vote[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  // The tally is multi-user: poll so a member watching the tab sees others' choices
  return useQuery({ queryKey: ['votes', ref.slug, poolId], queryFn: async () => await platform.listVotes(poolId), enabled, refetchInterval: 30_000 })
}

/** The newest votes only — the activity feed needs the latest lines, not every proposal's full set */
export function useRecentPoolVotes (poolId: string, enabled = true): UseQueryResult<Vote[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['votes-recent', ref.slug, poolId],
    queryFn: async () => await platform.listVotesInPool(poolId, 100),
    enabled,
    refetchInterval: 30_000
  })
}

export function useRecentVotes (limit = 100): UseQueryResult<Vote[]> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({ queryKey: ['recent-votes', ref.slug, limit], queryFn: async () => await platform.listRecentVotes(limit), refetchInterval: 30_000 })
}

export function useProposalSentiment (proposalHash: string | null): UseQueryResult<ProposalSentiment> {
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['sentiment', ref.slug, proposalHash],
    queryFn: async () => await fetchProposalSentiment(proposalHash as string, platform),
    enabled: proposalHash != null && isProposalHash(proposalHash),
    refetchInterval: 30_000
  })
}

export function useGovernanceStats (): UseQueryResult<GovernanceStats> {
  const { network } = useNetwork()
  const { ref } = useGeneration()
  const platform = platformFor(ref)
  return useQuery({
    queryKey: ['governance-stats', ref.slug, network],
    queryFn: async () => await fetchGovernanceStats(network, platform),
    refetchInterval: 30_000
  })
}

const COUNT_STATS = ['created', 'formed', 'active', 'error', 'dissolved', 'signing', 'open'] as const

/** A creator's pools may sit in any generation, so the profile merges one fetch per generation */
export function useCreatorProfile (ownerId: string): { data: CreatorProfile | undefined, isLoading: boolean } {
  const results = useQueries({
    queries: GENERATIONS.map(generation => ({
      queryKey: ['creator', generation.slug, ownerId],
      queryFn: async () => await fetchCreatorProfile(ownerId, platformFor(generation))
    }))
  })
  const profiles = results.flatMap(result => result.data != null ? [result.data] : [])
  const data = results.every(result => result.data !== undefined)
    ? {
        ownerId,
        pools: profiles.flatMap(profile => profile.pools),
        feedback: profiles.flatMap(profile => profile.feedback),
        stats: {
          ...Object.fromEntries(COUNT_STATS.map(key => [key, profiles.reduce((sum, p) => sum + p.stats[key], 0)])) as Record<typeof COUNT_STATS[number], number>,
          avgLockHours: (() => {
            const known = profiles.filter(p => p.stats.avgLockHours != null)
            const weight = known.reduce((sum, p) => sum + p.stats.created, 0)
            return weight === 0 ? null : known.reduce((sum, p) => sum + (p.stats.avgLockHours as number) * p.stats.created, 0) / weight
          })(),
          rating: (() => {
            const rated = profiles.filter(p => p.stats.rating != null)
            const weight = rated.reduce((sum, p) => sum + p.stats.ratingCount, 0)
            return weight === 0 ? null : rated.reduce((sum, p) => sum + (p.stats.rating as number) * p.stats.ratingCount, 0) / weight
          })(),
          ratingCount: profiles.reduce((sum, p) => sum + p.stats.ratingCount, 0)
        }
      } satisfies CreatorProfile
    : undefined
  return { data, isLoading: results.some(result => result.isLoading) }
}

/** A dashboard row carries the generation it lives in, so links can be built for the right contract */
export interface MyDashboard {
  created: Array<{ state: PoolState, generation: string }>
  joined: Array<{ state: PoolState, join: Join, selected: boolean, generation: string }>
  actions: Array<{ kind: ActionKind, pool: Pool, generation: string }>
  votes: Array<{ vote: Vote, pool: Pool | null, generation: string }>
  reviews: Array<{ feedback: Feedback, pool: Pool | null, generation: string }>
}

/**
 * The dashboard is not generation-scoped: an identity's pools live wherever they were created, so this
 * asks every registered generation and merges the answers, tagging each row with its generation.
 */
export function useMyActivity (identity: string | null): { data: MyDashboard | undefined, isLoading: boolean, error: unknown } {
  const results = useQueries({
    queries: GENERATIONS.map(generation => ({
      queryKey: ['me', generation.slug, identity],
      queryFn: async () => await fetchMyActivity(identity as string, platformFor(generation)),
      enabled: identity != null,
      refetchInterval: 15_000
    }))
  })

  const data = results.every(result => result.data !== undefined)
    ? (() => {
        const created = results.flatMap((result, index) =>
          (result.data?.created ?? []).map(state => ({ state, generation: GENERATIONS[index].slug })))
        const joined = results.flatMap((result, index) =>
          (result.data?.joined ?? []).map(item => ({ ...item, generation: GENERATIONS[index].slug })))
        const actions = results.flatMap((result, index) =>
          (result.data?.actions ?? []).map(action => ({ ...action, generation: GENERATIONS[index].slug })))
        const votes = results.flatMap((result, index) =>
          (result.data?.votes ?? []).map(item => ({ ...item, generation: GENERATIONS[index].slug })))
        const reviews = results.flatMap((result, index) =>
          (result.data?.reviews ?? []).map(item => ({ ...item, generation: GENERATIONS[index].slug })))
        // Pool ids are unique across contracts; first wins so an older generation keeps the row it owns
        const first = <T>(items: T[], key: (item: T) => string): T[] => {
          const seen = new Map<string, T>()
          for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item)
          return [...seen.values()]
        }
        return {
          created: first(created, item => item.state.pool.id),
          joined: first(joined, item => item.state.pool.id),
          actions: first(actions, action => `${action.kind}:${action.pool.id}`),
          votes: first(votes, item => item.vote.id),
          reviews: first(reviews, item => item.feedback.id)
        }
      })()
    : undefined

  return {
    data,
    isLoading: results.some(result => result.isLoading),
    error: results.find(result => result.error != null)?.error ?? null
  }
}

/** DPNS names are network-wide, not per contract, so this stays on the default platform source */
export function useUsername (identityId: string): string | null {
  const { data } = useQuery({
    queryKey: ['username', identityId],
    queryFn: async () => await backend.platform.getUsername(identityId),
    enabled: identityId !== '',
    staleTime: Infinity
  })
  return data ?? null
}

/** pshenmic.dev's hosting terms and available servers; only the live backend has them */
export function useHostingOptions (): UseQueryResult<HostingOptions> {
  return useQuery({
    queryKey: ['hosting'],
    queryFn: async () => await backend.hosting.getOptions(),
    enabled: backend.mode === 'live',
    staleTime: 30_000
  })
}

export function useBlockHeight (): number | null {
  const { data } = useQuery({ queryKey: ['height'], queryFn: backend.chain.getBestBlockHeight, refetchInterval: 60_000 })
  return data ?? null
}

/**
 * Runs a Platform write or broadcast, then refreshes everything: a single document can change
 * the derived status of pools, dashboards and profiles.
 */
export function useWrite<TArgs, TResult> (write: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: async () => { await client.invalidateQueries() }
  })
}