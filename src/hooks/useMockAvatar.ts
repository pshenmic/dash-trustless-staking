import { useSyncExternalStore } from 'react'
import { getMockAvatar, getMockAvatars, subscribeMockAvatars } from '../data/mock/mockAvatars'

/** All mock avatars by pool id; re-renders when one is set or cleared */
export function useMockAvatars (): Record<string, string> {
  return useSyncExternalStore(subscribeMockAvatars, getMockAvatars, getMockAvatars)
}

export function useMockAvatar (poolId: string): string | undefined {
  return useMockAvatars()[poolId]
}

export { getMockAvatar, setMockAvatar } from '../data/mock/mockAvatars'