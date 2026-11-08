import { backend } from '../data'
import { useSettings } from './settings'
import type { Network } from './types'

/** Live data is on testnet whatever Settings says; mock data follows Settings */
export function useNetwork (): { network: Network, strict: boolean } {
  const { settings } = useSettings()
  return backend.mode === 'live' ? { network: 'testnet', strict: true } : { network: settings.network, strict: false }
}
