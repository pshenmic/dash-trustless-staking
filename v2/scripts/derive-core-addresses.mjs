#!/usr/bin/env node
/*
 * Derives Core (L1) addresses and their private keys from a BIP39 seed phrase.
 *
 * Usage:
 *   node scripts/derive-core-addresses.mjs --mnemonic-file phrase.txt --out addresses.json
 *   DASH_MNEMONIC="word1 word2 ..." node scripts/derive-core-addresses.mjs --count 300
 *
 * Options:
 *   --count <n>            how many addresses (default 300)
 *   --network <name>       testnet (default) or mainnet
 *   --path <template>      default m/44'/<coin>/0'/0/{index}
 *   --mnemonic <words>     phrase on the command line (prefer --mnemonic-file or env)
 *   --mnemonic-file <path> file containing the phrase
 *   --out <path>           output file (default ./core-addresses.json)
 *
 * The output contains private keys in WIF form. It is written with mode 600 and is never printed;
 * keep it out of the repository.
 */
import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { Network, PrivateKey, PublicKey } from 'dash-core-sdk'

function arg (name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const count = Number(arg('count', '300'))
const networkName = arg('network', 'testnet')
const network = networkName === 'mainnet' ? Network.Mainnet : Network.Testnet
const coinType = networkName === 'mainnet' ? 5 : 1
const pathTemplate = arg('path', `m/44'/${coinType}'/0'/0/{index}`)
const passphrase = arg('passphrase', '')
const out = arg('out', './core-addresses.json')
const mnemonic = (arg('mnemonic') ?? process.env.DASH_MNEMONIC ??
  (arg('mnemonic-file') != null ? readFileSync(arg('mnemonic-file'), 'utf8') : '')).trim().replace(/\s+/g, ' ')

if (!Number.isInteger(count) || count < 1 || count > 10000) {
  console.error('--count must be an integer between 1 and 10000')
  process.exit(1)
}

if (!mnemonic) {
  console.error('No seed phrase: pass --mnemonic, --mnemonic-file or set DASH_MNEMONIC')
  process.exit(1)
}

if (!validateMnemonic(mnemonic, wordlist)) {
  console.error('That seed phrase is not a valid BIP39 mnemonic (english wordlist, checksum must match)')
  process.exit(1)
}

const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, passphrase))
const addresses = []

for (let index = 0; index < count; index++) {
  const path = pathTemplate.replace('{index}', String(index))
  const derived = root.derive(path)

  if (derived.privateKey == null || derived.publicKey == null) {
    console.error(`No key material at ${path}`)
    process.exit(1)
  }

  addresses.push({
    index,
    path,
    address: new PublicKey(derived.publicKey, true).getAddress(network),
    publicKey: Buffer.from(derived.publicKey).toString('hex'),
    wif: new PrivateKey(derived.privateKey, network, true).toWIF()
  })
}

writeFileSync(out, JSON.stringify({ network: networkName, count, pathTemplate, addresses }, null, 2) + '\n', { mode: 0o600 })

console.log(`Derived ${count} ${networkName} addresses with ${pathTemplate}`)
console.log(`First: ${addresses[0].address}`)
console.log(`Last:  ${addresses[count - 1].address}`)
console.log(`Written to ${out} (mode 600, contains private keys — do not commit it)`)
