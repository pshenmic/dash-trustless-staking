import { describe, expect, test } from 'vitest'
import { Network, PrivateKey, Transaction, signCompact, verifyCompact } from 'dash-core-sdk'
import { randomBytes } from 'node:crypto'
import { addressToScript } from './address'
import { sha256 } from '@noble/hashes/sha256'
import { fromHex, toHex } from './bytes'
import { buildRegistration, extractScriptSigs, rawDigest, verifyScriptSigs, withJoinSignatures } from './registration'
import { signFundingWithKeys } from './signFunding'
import type { Join, Pool, Prevout } from './types'

function makeKey (): PrivateKey {
  return new PrivateKey(randomBytes(32), Network.Testnet, true)
}

function addressOf (key: PrivateKey): string {
  return key.getPublicKey().getAddress(Network.Testnet)
}

function scriptOf (address: string): string {
  return toHex(addressToScript(address, 'testnet'))
}

function joinWith (id: string, owner: string, txid: string, amount: number): Join {
  return {
    id,
    poolId: 'pool-id',
    ownerId: id,
    inputs: [{ txid, vout: 0 }],
    amount,
    refundAddress: owner,
    rewardAddress: owner,
    ownerAddress: owner,
    changeAddress: owner,
    votingKeyId: 'aa'.repeat(20),
    createdAt: 1
  } as unknown as Join
}

const ownerA = makeKey()
const ownerB = makeKey()
const utxoA = makeKey()
const utxoB = makeKey()

const members = [
  joinWith('join-a', addressOf(ownerA), 'aa'.repeat(32), 600_00000000),
  joinWith('join-b', addressOf(ownerB), 'bb'.repeat(32), 400_00000000)
]

const pool = {
  id: 'pool-id',
  ownerId: 'creator',
  votingAddress: addressOf(ownerA),
  operatorPubKey: 'ab'.repeat(48),
  service: '1.2.3.4:19999',
  fee: 100_000,
  earlyPeriodBlocks: 420480,
  earlyPenalty: 1_000_000,
  createdAt: 1,
  locked: true
} as unknown as Pool

const inputValues = new Map<string, number | null>([
  [`${'aa'.repeat(32)}:0`, 600_00010000],
  [`${'bb'.repeat(32)}:0`, 400_00010000]
])

const prevouts = new Map<string, Prevout | null>([
  [`${'aa'.repeat(32)}:0`, { script: scriptOf(addressOf(utxoA)), value: 600_00010000 }],
  [`${'bb'.repeat(32)}:0`, { script: scriptOf(addressOf(utxoB)), value: 400_00010000 }]
])

function registration (): ReturnType<typeof buildRegistration> {
  return buildRegistration(pool, members, inputValues as never)
}

function consentsFor (reg: ReturnType<typeof buildRegistration>): string[] {
  return [ownerA, ownerB].map(key => Buffer.from(signCompact(rawDigest(reg.consentHash), key), 'hex').toString('base64'))
}

describe('signFundingWithKeys', () => {
  test('declares the collateral output index in the payload outpoint', () => {
    const reg = registration()
    const payload = Transaction.fromHex(reg.unsignedHex).extraPayload as unknown as {
      collateralOutpoint: { txId: string, vOut: number }
    }

    // Core's standardness exemption for the nonstandard DSHC script needs hash null and n == index,
    // otherwise `sendrawtransaction` rejects the transaction with the policy reason "scriptpubkey".
    expect(payload.collateralOutpoint.txId).toBe('00'.repeat(32))
    expect(payload.collateralOutpoint.vOut).toBe(reg.collateralIndex)
  })

  test('commits the inputs hash Core recalculates', () => {
    const reg = registration()
    const payload = Transaction.fromHex(reg.unsignedHex).extraPayload as unknown as { inputsHash: string }

    // Independent of the builder: SHA256d over prevouts (hash little-endian, then vout little-endian)
    const prevouts = reg.tx.inputs.map(input => {
      const hash = Buffer.from(input.txId, 'hex').reverse()
      const vout = Buffer.alloc(4)
      vout.writeUInt32LE(input.vOut)
      return Buffer.concat([hash, vout])
    })

    expect(payload.inputsHash).toBe(toHex(Uint8Array.from(sha256(sha256(Buffer.concat(prevouts)))).reverse()))
  })

  test('serializes the join signatures as hex, not base64', () => {
    const reg = registration()
    const consents = consentsFor(reg)
    const joined = withJoinSignatures(reg, consents)

    // 65 bytes per signature, one per share, in share order
    const payload = Transaction.fromHex(joined).extraPayload as unknown as { joinSigs: string[] }
    expect(payload.joinSigs).toHaveLength(2)
    expect(payload.joinSigs[0]).toBe(toHex(Buffer.from(consents[0], 'base64')))
    expect(payload.joinSigs[0]).toMatch(/^[0-9a-f]{130}$/)
  })

  test('signs every input of the member and the signatures verify', () => {
    const reg = registration()
    const joined = withJoinSignatures(reg, consentsFor(reg))

    const result = signFundingWithKeys(joined, members, 0, [utxoA.toWIF()], prevouts)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const scriptSigs = extractScriptSigs(joined, members, 0, result.hex)
    expect(scriptSigs).not.toBeNull()
    expect(verifyScriptSigs(joined, members, 0, scriptSigs ?? [], prevouts)).toBe(true)
    // The other member's input is untouched
    expect(extractScriptSigs(joined, members, 1, result.hex)).toBeNull()
  })

  test('accepts several keys, one per input', () => {
    const reg = registration()
    const joined = withJoinSignatures(reg, consentsFor(reg))
    const twoInputs: Join[] = [{ ...members[0], inputs: [{ txid: 'aa'.repeat(32), vout: 0 }, { txid: 'cc'.repeat(32), vout: 1 }] }]
    const values = new Map(prevouts)
    values.set(`${'cc'.repeat(32)}:1`, { script: scriptOf(addressOf(utxoB)), value: 600_00010000 })

    const result = signFundingWithKeys(joined, twoInputs, 0, [`${utxoA.toWIF()}, ${utxoB.toWIF()}`], values)
    expect(result.ok).toBe(true)
  })

  test('refuses when a committed input has no matching key, and names the address', () => {
    const reg = registration()
    const joined = withJoinSignatures(reg, consentsFor(reg))

    const result = signFundingWithKeys(joined, members, 0, [utxoB.toWIF()], prevouts)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(addressOf(utxoA))
  })

  test('refuses malformed key input and a non-member identity', () => {
    const reg = registration()
    const joined = withJoinSignatures(reg, consentsFor(reg))

    expect(signFundingWithKeys(joined, members, 0, [], prevouts)).toEqual({ ok: false, error: 'Paste at least one private key' })
    expect(signFundingWithKeys(joined, members, 0, ['not-a-key'], prevouts)).toMatchObject({ ok: false })
    expect(signFundingWithKeys(joined, members, 5, [utxoA.toWIF()], prevouts)).toMatchObject({ ok: false })
  })

  test('does not depend on the consent signature in the same way as the digest', () => {
    const reg = registration()
    const joined = withJoinSignatures(reg, consentsFor(reg))
    const result = signFundingWithKeys(joined, members, 0, [utxoA.toWIF()], prevouts)
    expect(result.ok).toBe(true)
    // Sanity: a consent signature is compact over the consent hash, not a DER input signature
    expect(verifyCompact(rawDigest(reg.consentHash), toHex(Buffer.from(consentsFor(reg)[0], "base64")), ownerA.getPublicKey().getPublicKeyHash())).toBe(true)
    expect(fromHex(reg.unsignedHex).length).toBeGreaterThan(0)
  })
})