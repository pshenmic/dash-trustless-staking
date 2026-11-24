import { DashPlatformSDK } from 'dash-platform-sdk'
import { createSigner } from '../../wallet/privateKeySigner'
import type { Backend, ContractSource, PlatformSource } from '../types'
import { createLiveChain } from './chain'
import { createLiveHosting } from './hosting'
import { createLivePlatform } from './platform'
import { createLiveTxBuilder } from './txBuilder'

/*
 * Testnet backend. Every Platform document, plus the Core side: transactions and the chainlocked
 * masternode list over DAPI, and the shared registration transaction built by lib/registration.
 *
 * One SDK, one Core client, one platform source per generation. `platform` is the default generation's
 * source so existing call sites keep working; contract-scoped reads use `platformFor(slug)`.
 */

export function createTestnetBackend (contracts: ContractSource[], dapiUrls?: string[]): Backend {
  const sdk = new DashPlatformSDK(dapiUrls != null && dapiUrls.length > 0 ? { network: 'testnet', dapiUrl: dapiUrls } as never : { network: 'testnet' })
  const signer = createSigner(sdk)
  const sources = new Map<string, PlatformSource>(
    contracts.map(contract => [contract.slug, createLivePlatform(sdk, contract, 'testnet', signer)])
  )
  const fallback = sources.get(contracts[contracts.length - 1].slug)!

  return {
    mode: 'live',
    features: {
      registration: true
    },
    platform: fallback,
    platformFor: (slug: string) => sources.get(slug) ?? fallback,
    chain: createLiveChain(dapiUrls),
    tx: createLiveTxBuilder(),
    hosting: createLiveHosting(sdk)
  }
}