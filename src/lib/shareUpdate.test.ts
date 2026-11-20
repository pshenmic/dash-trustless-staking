import { describe, expect, test } from 'vitest'
import { ExtraPayload, Input, Network, Output, PrivateKey, Script, Transaction, TransactionType } from 'dash-core-sdk'
import { randomBytes } from '@noble/hashes/utils'
import { addressToScript } from './address'
import { toHex } from './bytes'
import { signCompact } from './compactSignature'
import { inputsHashOf } from './registration'
import { checkSignedShareUpdate, rewardAddressProblem, shareUpdateBytes, shareUpdateCommand, shareUpdateDigest, signShareUpdate } from './shareUpdate'

const PRO_TX_HASH = 'ab'.repeat(32)
const VOTING = 'ygVtwBQx7MiHS84FtX8CFTqgFBf8z25B2b'
const INPUTS_HASH = 'cd'.repeat(32)

function makeKey (): PrivateKey {
  return new PrivateKey(randomBytes(32), Network.Testnet, true)
}

function addressOf (key: PrivateKey): string {
  return key.getPublicKey().getAddress(Network.Testnet)
}

describe('shareUpdateBytes', () => {
  test('serializes exactly the bytes the SDK payload class emits before the signature', () => {
    const reward = addressOf(makeKey())
    const script = Script.fromHex(toHex(addressToScript(reward, 'testnet')))
    const ProUpShareTx = (ExtraPayload as any).ProUpShareTx as new (...args: any[]) => { bytes: () => Uint8Array }

    // An empty signature serializes as a single 0x00 length byte, which Core omits from the sign hash
    const payloadBytes = new ProUpShareTx(1, PRO_TX_HASH, 2, script, INPUTS_HASH, '').bytes()

    expect(toHex(new Uint8Array(shareUpdateBytes({ proTxHash: PRO_TX_HASH, shareIndex: 2, rewardAddress: reward, inputsHash: INPUTS_HASH })))).toBe(
      toHex(payloadBytes.slice(0, payloadBytes.length - 1))
    )
  })

  test('the digest covers every field', () => {
    const update = { proTxHash: PRO_TX_HASH, shareIndex: 2, rewardAddress: addressOf(makeKey()), inputsHash: INPUTS_HASH }
    const base = shareUpdateDigest(update)
    expect(shareUpdateDigest({ ...update, shareIndex: 3 })).not.toBe(base)
    expect(shareUpdateDigest({ ...update, proTxHash: 'ba'.repeat(32) })).not.toBe(base)
    expect(shareUpdateDigest({ ...update, rewardAddress: addressOf(makeKey()) })).not.toBe(base)
    expect(shareUpdateDigest({ ...update, inputsHash: 'dc'.repeat(32) })).not.toBe(base)
    expect(shareUpdateDigest(update)).toBe(base)
  })
})

describe('shareUpdateCommand', () => {
  test('asks for the signed hex rather than submitting', () => {
    expect(shareUpdateCommand({ proTxHash: PRO_TX_HASH, shareIndex: 2, rewardAddress: VOTING, feeSourceAddress: 'yFee' }, 'testnet')).toBe(
      `dash-cli -testnet protx shared_update_share "${PRO_TX_HASH}" 2 "${VOTING}" "yFee" false`
    )
    expect(shareUpdateCommand({ proTxHash: PRO_TX_HASH, shareIndex: 0, rewardAddress: 'XReward', feeSourceAddress: 'XFee' }, 'mainnet')).toBe(
      `dash-cli protx shared_update_share "${PRO_TX_HASH}" 0 "XReward" "XFee" false`
    )
  })
})

describe('rewardAddressProblem', () => {
  test('rejects the voting key and every share owner key', () => {
    const owner = addressOf(makeKey())
    const shares = { votingAddress: VOTING, ownerAddresses: [owner, addressOf(makeKey())] }

    expect(rewardAddressProblem(VOTING, shares)).toBe('The reward address cannot be the pool voting address.')
    expect(rewardAddressProblem(owner, shares)).toBe('The reward address cannot be any share owner address.')
    expect(rewardAddressProblem(addressOf(makeKey()), shares)).toBeNull()
    expect(rewardAddressProblem('not-an-address', shares)).toBe('That is not a valid address for this network.')
  })
})

describe('checkSignedShareUpdate', () => {
  function signedHex (options: { shareIndex?: number } = {}): { hex: string, update: { proTxHash: string, shareIndex: number, rewardAddress: string }, owner: string } {
    const ownerKey = makeKey()
    const owner = addressOf(ownerKey)
    const reward = addressOf(makeKey())
    const shareIndex = options.shareIndex ?? 2
    const update = { proTxHash: PRO_TX_HASH, shareIndex, rewardAddress: reward }

    const script = Script.fromHex(toHex(addressToScript(reward, 'testnet')))
    const tx = new Transaction(
      [new Input('11'.repeat(32), 0, new Script(), 0xffffffff)],
      [new Output(1000n, Script.fromHex(toHex(addressToScript(owner, 'testnet'))))],
      0,
      3,
      TransactionType.TRANSACTION_PROVIDER_UPDATE_SHARE
    )
    const inputsHash = inputsHashOf(tx)
    const signature = signCompact(shareUpdateDigest({ ...update, inputsHash }, 'testnet'), ownerKey)
    const ProUpShareTx = (ExtraPayload as any).ProUpShareTx as new (...args: any[]) => unknown
    ;(tx as any).extraPayload = new ProUpShareTx(1, PRO_TX_HASH, shareIndex, script, inputsHash, signature)

    return { hex: tx.hex(), update, owner }
  }

  test('accepts a signed update that matches the request and the share owner', () => {
    const { hex, update, owner } = signedHex()
    const check = checkSignedShareUpdate(hex, update, owner, { votingAddress: VOTING, ownerAddresses: [owner] })
    expect(check.problems).toEqual([])
    expect(check.shareIndex).toBe(2)
    expect(check.rewardAddress).toBe(update.rewardAddress)
    expect(check.txid).toMatch(/^[0-9a-f]{64}$/)
  })

  test('rejects a transaction for another share', () => {
    const { hex, update, owner } = signedHex()
    const problems = checkSignedShareUpdate(hex, { ...update, shareIndex: 1 }, owner, { votingAddress: VOTING, ownerAddresses: [owner] }).problems.join(' ')
    expect(problems).toContain('not share 1')
  })

  test('rejects a signature from a different key', () => {
    const { hex, update, owner } = signedHex()
    const stranger = addressOf(makeKey())
    const problems = checkSignedShareUpdate(hex, update, stranger, { votingAddress: VOTING, ownerAddresses: [owner, stranger] }).problems.join(' ')
    expect(problems).toContain('signature does not belong')
  })

  test('rejects a reward address that reuses a share owner key', () => {
    const { hex, update, owner } = signedHex()
    const problems = checkSignedShareUpdate(hex, update, owner, { votingAddress: VOTING, ownerAddresses: [owner, update.rewardAddress] }).problems.join(' ')
    expect(problems).toContain('cannot be any share owner address')
  })

  test('rejects junk input', () => {
    expect(checkSignedShareUpdate('00', { proTxHash: PRO_TX_HASH, shareIndex: 0, rewardAddress: VOTING }, VOTING, { votingAddress: VOTING, ownerAddresses: [] }).problems).toEqual(['That is not a readable transaction.'])
  })
})

describe('signShareUpdate', () => {
  function setup (): { owner: PrivateKey, fee: PrivateKey, ownerAddress: string, feeAddress: string, prevoutScript: string } {
    const owner = makeKey()
    const fee = makeKey()
    const feeAddress = addressOf(fee)
    return { owner, fee, ownerAddress: addressOf(owner), feeAddress, prevoutScript: toHex(addressToScript(feeAddress, 'testnet')) }
  }

  test('signs the payload and the fee input into a transaction the preflight accepts', () => {
    const keys = setup()
    const reward = addressOf(makeKey())
    const result = signShareUpdate({
      proTxHash: PRO_TX_HASH,
      shareIndex: 2,
      rewardAddress: reward,
      shareOwnerAddress: keys.ownerAddress,
      fee: { outpoint: { txid: '11'.repeat(32), vout: 0 }, prevout: { script: keys.prevoutScript, value: 100_000 } },
      feeAmount: 20_000,
      changeAddress: keys.feeAddress,
      ownerKeyText: keys.owner.toWIF(),
      feeKeyText: keys.fee.toWIF()
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const check = checkSignedShareUpdate(result.hex, { proTxHash: PRO_TX_HASH, shareIndex: 2, rewardAddress: reward }, keys.ownerAddress, { votingAddress: VOTING, ownerAddresses: [keys.ownerAddress] })
    expect(check.problems).toEqual([])
    expect(result.txid).toBe(check.txid)
  })

  test('refuses a share owner key that belongs to another share', () => {
    const keys = setup()
    const result = signShareUpdate({
      proTxHash: PRO_TX_HASH,
      shareIndex: 0,
      rewardAddress: addressOf(makeKey()),
      shareOwnerAddress: addressOf(makeKey()),
      fee: { outpoint: { txid: '11'.repeat(32), vout: 0 }, prevout: { script: keys.prevoutScript, value: 100_000 } },
      feeAmount: 20_000,
      changeAddress: keys.feeAddress,
      ownerKeyText: keys.owner.toWIF(),
      feeKeyText: keys.fee.toWIF()
    })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('controls') })
  })

  test('refuses a fee key that does not own the input', () => {
    const keys = setup()
    const result = signShareUpdate({
      proTxHash: PRO_TX_HASH,
      shareIndex: 0,
      rewardAddress: addressOf(makeKey()),
      shareOwnerAddress: keys.ownerAddress,
      fee: { outpoint: { txid: '11'.repeat(32), vout: 0 }, prevout: { script: keys.prevoutScript, value: 100_000 } },
      feeAmount: 20_000,
      changeAddress: keys.feeAddress,
      ownerKeyText: keys.owner.toWIF(),
      feeKeyText: makeKey().toWIF()
    })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('does not control') })
  })

  test('requires a change address when the fee input leaves change', () => {
    const keys = setup()
    const result = signShareUpdate({
      proTxHash: PRO_TX_HASH,
      shareIndex: 0,
      rewardAddress: addressOf(makeKey()),
      shareOwnerAddress: keys.ownerAddress,
      fee: { outpoint: { txid: '11'.repeat(32), vout: 0 }, prevout: { script: keys.prevoutScript, value: 100_000 } },
      feeAmount: 20_000,
      ownerKeyText: keys.owner.toWIF(),
      feeKeyText: keys.fee.toWIF()
    })
    expect(result).toEqual({ ok: false, error: 'Enter a change address for the rest of the fee input' })
  })
})