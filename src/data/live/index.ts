import { DashPlatformSDK } from 'dash-platform-sdk'
import { currentSession } from '../../wallet/authSession'
import { createSigner } from '../../wallet/privateKeySigner'
import type { Backend } from '../types'
import { createLiveChain } from './chain'
import { createLiveChatCrypto } from './chat'
import { createLivePlatform } from './platform'
import { createLiveTxBuilder } from './txBuilder'

/*
 * Testnet backend. Every Platform document, plus the Core side: transactions and the chainlocked
 * masternode list over DAPI, and the shared registration transaction built by lib/registration.
 */

export function createTestnetBackend (contractId: string, dapiUrls?: string[]): Backend {
  const sdk = new DashPlatformSDK(dapiUrls != null && dapiUrls.length > 0 ? { network: 'testnet', dapiUrl: dapiUrls } as never : { network: 'testnet' })

  return {
    mode: 'live',
    features: {
      registration: true,
      // Private chat needs the identity encryption key, which only the private-key login holds
      get privateChat () { return currentSession()?.mode === 'privateKey' }
    },
    platform: createLivePlatform(sdk, contractId, 'testnet', createSigner(sdk)),
    chain: createLiveChain(dapiUrls),
    tx: createLiveTxBuilder(),
    chat: createLiveChatCrypto()
  }
}