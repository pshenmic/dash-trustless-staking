import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { backend } from '../data'
import {
  fetchCreatorProfile, fetchMyActivity, fetchPoolState, fetchPoolSummaries,
  type CreatorProfile, type MyActivity, type PoolState, type PoolSummary
} from '../data/queries'
import type { HostingOptions } from '../data/types'
import type { Feedback, Message, Pool } from '../lib/types'

export function usePoolSummaries (): UseQueryResult<PoolSummary[]> {
  return useQuery({ queryKey: ['pools'], queryFn: fetchPoolSummaries, refetchInterval: 30_000 })
}

/** The grid's cached summary for this pool: instant header and join numbers before any query resolves */
export function usePoolPreview (poolId: string): PoolSummary | null {
  const client = useQueryClient()
  return client.getQueryData<PoolSummary[]>(['pools'])?.find(s => s.pool.id === poolId) ?? null
}

export function usePoolDocument (poolId: string): UseQueryResult<Pool | null> {
  const client = useQueryClient()
  return useQuery({
    queryKey: ['pool-doc', poolId],
    queryFn: async () => await backend.platform.getPool(poolId),
    staleTime: 20_000,
    placeholderData: () => client.getQueryData<PoolSummary[]>(['pools'])?.find(s => s.pool.id === poolId)?.pool
  })
}

export function usePoolState (poolId: string): UseQueryResult<PoolState | null> {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      // same key and function as usePoolDocument, so react-query shares one in-flight request
      const pool = await queryClient.fetchQuery({
        queryKey: ['pool-doc', poolId],
        queryFn: async () => await backend.platform.getPool(poolId),
        staleTime: 20_000
      })
      return await fetchPoolState(poolId, pool)
    },
    // Poll faster while the pool is moving through signing and confirmation
    refetchInterval: query => query.state.data?.status === 'SIGNING' ? 4_000 : 20_000
  })
}

export function useMessages (channel: string): UseQueryResult<Message[]> {
  return useQuery({
    queryKey: ['messages', channel],
    queryFn: async () => await backend.platform.listMessages(channel),
    refetchInterval: 8_000
  })
}

export function useFeedback (poolId: string): UseQueryResult<Feedback[]> {
  return useQuery({ queryKey: ['feedback', poolId], queryFn: async () => await backend.platform.listFeedback(poolId) })
}

export function useCreatorProfile (ownerId: string): UseQueryResult<CreatorProfile> {
  return useQuery({ queryKey: ['creator', ownerId], queryFn: async () => await fetchCreatorProfile(ownerId) })
}

export function useMyActivity (identity: string | null): UseQueryResult<MyActivity> {
  return useQuery({
    queryKey: ['me', identity],
    queryFn: async () => await fetchMyActivity(identity as string),
    enabled: identity != null,
    refetchInterval: 15_000
  })
}

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
