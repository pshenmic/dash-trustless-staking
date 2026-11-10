import { DashPlatformSDK } from 'dash-platform-sdk'
import { mockChatCrypto } from '../mock/mockChat'
import type { Backend } from '../types'
import { createLiveChain } from './chain'
import { createLivePlatform, type Signer } from './platform'
import { createLiveTxBuilder } from './txBuilder'

/*
 * Testnet backend. Every Platform document, plus the Core side: transactions and the chainlocked
 * masternode list over DAPI, and the shared registration transaction built by lib/registration.
 */

export function createTestnetBackend (contractId: string, signer: Signer, dapiUrls?: string[]): Backend {
  const sdk = new DashPlatformSDK(dapiUrls != null && dapiUrls.length > 0 ? { network: 'testnet', dapiUrl: dapiUrls } as never : { network: 'testnet' })

  return {
    mode: 'live',
    features: { registration: true, privateChat: false },
    platform: createLivePlatform(sdk, contractId, 'testnet', signer),
    chain: createLiveChain(dapiUrls),
    tx: createLiveTxBuilder(),
    chat: mockChatCrypto
  }
}