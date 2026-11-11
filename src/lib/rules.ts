import {
  COLLATERAL, MAX_EARLY_PERIOD_BLOCKS, MAX_OPERATOR_REWARD_BP, MAX_SHARES, MIN_SHARE, MIN_SHARES
} from './consensus'
import { decodeAddress } from './address'
import { isCountryCode } from './countries'
import { formatDash } from './format'
import type { Duffs, FeePayer, Join, Pool } from './types'

/*
 * Client-side validation rules (DESIGN.md §5) and the money math shared by the registration
 * transaction builder and the UI. Everything here is pure and mirrors Dash Core consensus.
 */

// Base58 without 0, O, I, l
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

/**
 * Cheap shape check for a Dash address. It catches typos and wrong networks, not bad checksums:
 * the checksum is verified when the data layer converts the address into a script.
 * Testnet P2PKH starts with "y", P2SH with "8" or "9"; mainnet P2PKH with "X", P2SH with "7".
 */
export function isAddressShape (address: string, network: 'testnet' | 'mainnet', p2pkhOnly = false, strict = false): boolean {
  const value = address.trim()
  if (strict) {
    // Live data: the address must really decode (checksum and version), since it becomes script bytes
    const decoded = decodeAddress(value, network)
    return decoded != null && (!p2pkhOnly || decoded.type === 'p2pkh')
  }
  if (value.length < 26 || value.length > 35 || !BASE58.test(value)) return false
  const first = value[0]
  if (network === 'testnet') return first === 'y' || (!p2pkhOnly && (first === '8' || first === '9'))
  return first === 'X' || (!p2pkhOnly && first === '7')
}

export function isTxid (value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim())
}

export function isServiceAddress (value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(value.trim())
  if (match == null) return false
  const octets = match.slice(1, 5).map(Number)
  const port = Number(match[5])
  return octets.every(o => o <= 255) && port > 0 && port <= 65535
}

/** BLS public key (basic scheme), 48 bytes */
export function isBlsPublicKey (value: string): boolean {
  return /^[0-9a-fA-F]{96}$/.test(value.trim())
}

export interface PoolTermsInput {
  name: string
  description: string
  /** Empty when the creator leaves it for a later ProUpServTx */
  service: string
  /** Country code, or empty for worldwide */
  location: string
  operatorPubKey: string
  votingAddress: string
  operatorReward: number
  earlyPeriodBlocks: number
  earlyPenalty: Duffs
  fee: Duffs
  feePayer: FeePayer
}

/**
 * The registration fee split among members. A creator-paid fee gives every member a zero share: the
 * creator's fee input covers the whole amount instead.
 */
export function memberFeeShares (fee: Duffs, count: number, payer: FeePayer = 'members'): Duffs[] {
  if (count <= 0) return []
  if (payer === 'creator') return Array.from({ length: count }, () => 0)
  const per = Math.floor(fee / count)
  return Array.from({ length: count }, (_, i) => i === count - 1 ? fee - per * (count - 1) : per)
}

export function validatePoolTerms (terms: PoolTermsInput, network: 'testnet' | 'mainnet', strict = false): Partial<Record<keyof PoolTermsInput, string>> {
  const errors: Partial<Record<keyof PoolTermsInput, string>> = {}
  if (terms.name.trim().length === 0) errors.name = 'Enter a name'
  else if (terms.name.length > 63) errors.name = 'At most 63 characters'
  if (terms.description.length > 1000) errors.description = 'At most 1000 characters'
  if (terms.location !== '' && !isCountryCode(terms.location)) errors.location = 'Choose a country or Worldwide'
  if (terms.service !== '' && !isServiceAddress(terms.service)) errors.service = 'Use the IPv4 address and port, e.g. 203.0.113.10:9999'
  if (!isBlsPublicKey(terms.operatorPubKey)) errors.operatorPubKey = 'A BLS public key is 96 hex characters'
  if (!isAddressShape(terms.votingAddress, network, true, strict)) errors.votingAddress = `Enter a ${network} P2PKH address`
  if (!Number.isInteger(terms.operatorReward) || terms.operatorReward < 0 || terms.operatorReward > MAX_OPERATOR_REWARD_BP) {
    errors.operatorReward = 'Between 0% and 100%'
  }
  if (!Number.isInteger(terms.earlyPeriodBlocks) || terms.earlyPeriodBlocks < 0 || terms.earlyPeriodBlocks > MAX_EARLY_PERIOD_BLOCKS) {
    errors.earlyPeriodBlocks = `Between 0 and ${MAX_EARLY_PERIOD_BLOCKS.toLocaleString('en-US')} blocks`
  }
  if (terms.earlyPenalty < 0) {
    errors.earlyPenalty = 'Cannot be negative'
  } else if (terms.earlyPeriodBlocks === 0 && terms.earlyPenalty !== 0) {
    errors.earlyPenalty = 'Must be 0 when there is no early period'
  } else if (terms.earlyPenalty >= MIN_SHARE) {
    // Consensus requires penalty < the smallest share, and no share can be below 100 DASH
    errors.earlyPenalty = `Must be below ${formatDash(MIN_SHARE)}, the smallest possible share`
  }
  if (!Number.isInteger(terms.fee) || terms.fee <= 0) errors.fee = 'Enter a fee'
  if (terms.feePayer !== 'creator' && terms.feePayer !== 'members') errors.feePayer = 'Choose who pays the registration fee'
  return errors
}

export interface JoinInput {
  amount: Duffs | null
  ownerAddress: string
  refundAddress: string
  rewardAddress: string
  changeAddress: string
}

export function validateJoinInput (input: JoinInput, pool: Pool, network: 'testnet' | 'mainnet', strict = false): Partial<Record<keyof JoinInput, string>> {
  const errors: Partial<Record<keyof JoinInput, string>> = {}
  if (input.amount == null) errors.amount = 'Enter an amount'
  else if (input.amount < MIN_SHARE) errors.amount = `At least ${formatDash(MIN_SHARE)}`
  else if (input.amount > COLLATERAL) errors.amount = `At most ${formatDash(COLLATERAL)}`

  if (!isAddressShape(input.ownerAddress, network, true, strict)) errors.ownerAddress = `Enter a ${network} P2PKH address`
  if (!isAddressShape(input.refundAddress, network, false, strict)) errors.refundAddress = `Enter a ${network} address`
  if (input.rewardAddress.trim() !== '' && !isAddressShape(input.rewardAddress, network, false, strict)) errors.rewardAddress = `Enter a ${network} address`
  if (!isAddressShape(input.changeAddress, network, false, strict)) errors.changeAddress = `Enter a ${network} address`

  // Key separation rules (bad-protx-shares-payee-reuse)
  const owner = input.ownerAddress.trim()
  for (const field of ['refundAddress', 'rewardAddress'] as const) {
    const value = input[field].trim()
    if (value === '' || errors[field] != null) continue
    if (value === owner) errors[field] = 'Must differ from the share owner address'
    else if (value === pool.votingAddress) errors[field] = 'Must differ from the pool voting address'
  }
  if (errors.ownerAddress == null && owner === pool.votingAddress) errors.ownerAddress = 'Must differ from the pool voting address'
  return errors
}

/** Validation of a join document as read from Platform (§5). Returns reasons it is invalid. */
export function joinProblems (join: Join, pool: Pool): string[] {
  const problems: string[] = []
  if (join.poolId !== pool.id) problems.push('belongs to another pool')
  if (join.amount < MIN_SHARE || join.amount > COLLATERAL) problems.push('amount out of range')
  if (join.inputs.length === 0) problems.push('no inputs')
  if (join.refundAddress === pool.votingAddress || join.rewardAddress === pool.votingAddress) problems.push('pays the voting key')
  if (join.refundAddress === join.ownerAddress || join.rewardAddress === join.ownerAddress) problems.push('pays its own owner key')
  return problems
}

/**
 * Checks a member selection against the shared ProRegTx rules (IsShareListTriviallyValid).
 * Returns human-readable problems; an empty list means the lock can be published.
 */
export function selectionProblems (pool: Pool, joins: Join[]): string[] {
  const problems: string[] = []
  if (joins.length < MIN_SHARES) problems.push(`Select at least ${MIN_SHARES} members`)
  if (joins.length > MAX_SHARES) problems.push(`At most ${MAX_SHARES} members`)

  const total = joins.reduce((sum, j) => sum + j.amount, 0)
  if (joins.length > 0 && total !== COLLATERAL) {
    problems.push(total < COLLATERAL
      ? `${formatDash(COLLATERAL - total)} short of ${formatDash(COLLATERAL)}`
      : `${formatDash(total - COLLATERAL)} over ${formatDash(COLLATERAL)}`)
  }

  const minAmount = Math.min(...joins.map(j => j.amount))
  if (joins.length > 0 && pool.earlyPenalty >= minAmount) problems.push('The early penalty must be below the smallest share')

  const owners = new Set<string>()
  const refunds = new Set<string>()
  for (const join of joins) {
    if (owners.has(join.ownerAddress)) problems.push('Two members use the same owner address')
    if (refunds.has(join.refundAddress)) problems.push('Two members use the same refund address')
    owners.add(join.ownerAddress)
    refunds.add(join.refundAddress)
  }
  for (const join of joins) {
    for (const payee of [join.refundAddress, join.rewardAddress]) {
      if (payee != null && owners.has(payee)) problems.push('A refund or reward address pays a member owner key')
    }
  }
  return [...new Set(problems)]
}

/** Fee split: floor for every member, remainder to the last (DESIGN.md §6) */
export function feeShares (fee: Duffs, members: number): Duffs[] {
  if (members <= 0) return []
  const each = Math.floor(fee / members)
  return Array.from({ length: members }, (_, i) => i === members - 1 ? fee - each * (members - 1) : each)
}

/**
 * Split an amount across shares proportionally to their collateral amounts: sequential floor,
 * remainder to the last entry (SplitAmountByShares in Dash Core). Used for owner rewards.
 */
export function splitByShares (total: Duffs, amounts: Duffs[]): Duffs[] {
  const weightTotal = amounts.reduce((s, a) => s + a, 0)
  if (weightTotal === 0) return amounts.map(() => 0)
  let paid = 0
  return amounts.map((amount, i) => {
    if (i === amounts.length - 1) return total - paid
    const part = Math.floor((total * amount) / weightTotal)
    paid += part
    return part
  })
}

/** Share of the whole masternode owner reward a member receives, after the operator's cut */
export function rewardSharePercent (amount: Duffs, operatorRewardBp: number): number {
  return (amount / COLLATERAL) * (1 - operatorRewardBp / 10_000) * 100
}

export interface DissolvePreview {
  early: boolean
  blocksUntilPenaltyFree: number
  penalty: Duffs
  /** Refund per share in share order, including the bonus from the penalty */
  refunds: Duffs[]
  actorReceives: Duffs
}

/**
 * Minimal valid unilateral ProDisTx outputs (CheckProDisTxForList): inside the early period the
 * actor pays the penalty, distributed to the other shares pro rata by floor with the remainder on
 * the last non-actor output; the fee comes out of the actor's share.
 */
export function previewUnilateralDissolve (
  amounts: Duffs[], actorIndex: number, earlyPeriodBlocks: number, earlyPenalty: Duffs,
  registeredHeight: number, currentHeight: number, fee: Duffs
): DissolvePreview {
  const spendHeight = currentHeight + 1
  const early = spendHeight - registeredHeight < earlyPeriodBlocks
  const penalty = early ? earlyPenalty : 0
  const others = amounts.map((a, i) => i === actorIndex ? 0 : a)
  const bonuses = penalty > 0 ? splitByShares(penalty, others.filter((_, i) => i !== actorIndex)) : []
  let bonusIndex = 0
  const refunds = amounts.map((amount, i) => i === actorIndex ? amount - penalty - fee : amount + (bonuses[bonusIndex++] ?? 0))
  return {
    early,
    blocksUntilPenaltyFree: Math.max(0, registeredHeight + earlyPeriodBlocks - spendHeight),
    penalty,
    refunds,
    actorReceives: amounts[actorIndex] - penalty - fee
  }
}
