import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { Network as CoreNetwork, PrivateKey, PublicKey } from 'dash-core-sdk'
import { toHex } from './bytes.js'
import type { Network } from './types.js'

/**
 * BIP39 + BIP32 for Dash Core keys, which dash-core-sdk does not provide.
 * The SDK supplies the Dash-specific half: address encoding and WIF.
 */

/** BIP44 coin type: 1 on testnet, 5 on mainnet */
export function coinType (network: Network): number {
  return network === 'mainnet' ? 5 : 1
}

export function isValidSeedPhrase (phrase: string): boolean {
  return validateMnemonic(normalize(phrase), wordlist)
}

export interface CoreKey {
  index: number
  path: string
  address: string
  publicKey: string
  wif: string
}

export interface DeriveOptions {
  network?: Network
  /** BIP39 passphrase ("25th word"), empty when the phrase has none */
  passphrase?: string
  account?: number
  /** 0 = external (receive) chain, 1 = change */
  change?: number
  /** default m/44'/<coin>/<account>'/<change>/{index} */
  pathTemplate?: string
}

export function deriveCoreKey (phrase: string, index: number, options: DeriveOptions = {}): CoreKey {
  return deriveFromMaster(masterKey(phrase, options.passphrase ?? ''), index, options)
}

export function deriveCoreKeys (phrase: string, count = 1, options: DeriveOptions = {}): CoreKey[] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid address count: ${count}`)

  // One PBKDF2 pass and one master key for the whole sequence: deriving per index would repeat the
  // 2048-round seed stretch for every address.
  const master = masterKey(phrase, options.passphrase ?? '')

  return Array.from({ length: count }, (_, index) => deriveFromMaster(master, index, options))
}

function masterKey (phrase: string, passphrase: string): HDKey {
  const normalized = normalize(phrase)

  if (!validateMnemonic(normalized, wordlist)) throw new Error('Not a valid BIP39 seed phrase (english wordlist, checksum must match)')

  return HDKey.fromMasterSeed(mnemonicToSeedSync(normalized, passphrase))
}

function deriveFromMaster (master: HDKey, index: number, options: DeriveOptions): CoreKey {
  const { network = 'testnet', account = 0, change = 0 } = options
  const template = options.pathTemplate ?? `m/44'/${coinType(network)}'/${account}'/${change}/{index}`

  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid address index: ${index}`)

  const path = template.replace('{index}', String(index))
  const derived = master.derive(path)

  if (derived.privateKey == null || derived.publicKey == null) throw new Error(`No key material at ${path}`)

  const coreNetwork = network === 'mainnet' ? CoreNetwork.Mainnet : CoreNetwork.Testnet

  return {
    index,
    path,
    address: new PublicKey(derived.publicKey, true).getAddress(coreNetwork),
    publicKey: toHex(derived.publicKey),
    wif: new PrivateKey(derived.privateKey, coreNetwork, true).toWIF()
  }
}

/** Accepts pasted phrases with extra whitespace or line breaks */
function normalize (phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ').toLowerCase()
}