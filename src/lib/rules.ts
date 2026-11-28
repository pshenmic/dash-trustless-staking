import {
  COLLATERAL, MAX_ENTRY_FEE, MAX_EARLY_PERIOD_BLOCKS, MAX_OPERATOR_REWARD_BP, MAX_SHARES, MIN_SHARE, MIN_SHARES
} from './consensus'
import { decodeAddress } from './address'
import { isOperatorKeyPoint } from './bls'
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

export type PayoutRole = 'refund' | 'reward'

const PAYOUT_LABEL: Record<PayoutRole, string> = {
  refund: 'The refund address',
  reward: 'The reward address'
}

export interface PayoutScriptInput {
  role: PayoutRole
  address: string
  ownerAddress: string
  votingAddress: string
  network: 'testnet' | 'mainnet'
  /** Live data: decode the address, since it becomes script bytes */
  strict?: boolean
}

/**
 * Core's rules for a share's refund and reward scripts (`IsShareListTriviallyValid`:
 * `bad-protx-shares-payee`, `-payee-dest`, `-payee-reuse`).
 *
 * A reward may be empty — that means "pay the refund address" (`RewardScript()`) — while a refund may
 * not: both are run through `IsValidPayoutScript`, the empty reward is the one case Core skips.
 * Both must be P2PKH or P2SH and must not pay the share's owner key or the voting key.
 *
 * There is no uniqueness rule here: only refund scripts must differ from each other inside one
 * registration, which is a cross-member check and lives in `selectionProblems`. Reusing a reward
 * address across shares, or across pools, is legal.
 */
export function payoutScriptProblems (input: PayoutScriptInput): string[] {
  const value = input.address.trim()
  const label = PAYOUT_LABEL[input.role]
  if (value === '') return input.role === 'refund' ? ['A refund address is required'] : []
  if (!isAddressShape(value, input.network, false, input.strict ?? false)) {
    return [`${label} is not a ${input.network} P2PKH or P2SH address`]
  }

  const problems: string[] = []
  if (value === input.ownerAddress.trim()) problems.push(`${label} pays the share owner key`)
  if (value === input.votingAddress.trim()) problems.push(`${label} pays the voting key`)
  return problems
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
  /** Promotional fields, optional since generation 2: a pool is created without them and titled later */
  name?: string
  description?: string
  /** Empty when the creator leaves it for a later ProUpServTx */
  service: string
  operatorPubKey: string
  votingAddress: string
  operatorReward: number
  earlyPeriodBlocks: number
  earlyPenalty: Duffs
  fee: Duffs
  feePayer: FeePayer
  /** Flat amount each share pays the creator, in duffs; 0 when the pool charges none */
  entryFee?: Duffs
  /** Where the creator receives it; required when `entryFee` is above 0 */
  entryFeeAddress?: string
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
  if (terms.name != null) {
    if (terms.name.trim().length === 0) errors.name = 'Enter a name'
    else if (terms.name.length > 63) errors.name = 'At most 63 characters'
  }
  if (terms.description != null && terms.description.length > 1000) errors.description = 'At most 1000 characters'
  if (terms.service !== '' && !isServiceAddress(terms.service)) errors.service = 'Use the IPv4 address and port, e.g. 203.0.113.10:9999'
  if (!isBlsPublicKey(terms.operatorPubKey)) errors.operatorPubKey = 'A BLS public key is 96 hex characters'
  else if (!isOperatorKeyPoint(terms.operatorPubKey)) errors.operatorPubKey = 'That is not a valid BLS public key — check for a typo'
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
  const entryFee = terms.entryFee ?? 0
  if (!Number.isInteger(entryFee) || entryFee < 0) {
    errors.entryFee = 'Enter an amount in DASH'
  } else if (entryFee > MAX_ENTRY_FEE) {
    // A pool has at most MAX_SHARES shares, so the per-member cap is what keeps the total under 100 DASH
    errors.entryFee = `At most ${formatDash(MAX_ENTRY_FEE)} per member`
  } else if (entryFee > 0 && !isAddressShape(terms.entryFeeAddress ?? '', network, true, strict)) {
    errors.entryFeeAddress = `Enter the ${network} P2PKH address that receives it`
  }
  return errors
}

/**
 * What a reader has to trust about a pool's entry fee: our form caps it, but a pool published by another
 * client can carry more, and a fee with no payout address can never be paid.
 */
export function entryFeeProblems (pool: Pool): string[] {
  const fee = pool.entryFee ?? 0
  if (fee <= 0) return []
  const problems: string[] = []
  if (!Number.isInteger(fee)) problems.push('The entry fee is not a whole number of duffs')
  if (fee > MAX_ENTRY_FEE) problems.push(`The entry fee of ${formatDash(fee)} is above the ${formatDash(MAX_ENTRY_FEE)} limit`)
  if ((pool.entryFeeAddress ?? '') === '') problems.push('The entry fee has no payout address')
  return problems
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
  if (!isAddressShape(input.changeAddress, network, false, strict)) errors.changeAddress = `Enter a ${network} address`

  // A share's refund and reward scripts: Core's bad-protx-shares-payee / -payee-reuse set
  for (const [field, role] of [['refundAddress', 'refund'], ['rewardAddress', 'reward']] as const) {
    const problems = payoutScriptProblems({
      role, address: input[field], ownerAddress: input.ownerAddress, votingAddress: pool.votingAddress, network, strict
    })
    if (problems.length > 0) errors[field] = problems.join('. ')
  }

  const owner = input.ownerAddress.trim()
  if (errors.ownerAddress == null && owner === pool.votingAddress) errors.ownerAddress = 'Must differ from the pool voting address'
  return errors
}

/** Validation of a join document as read from Platform (§5). Returns reasons it is invalid. */
export function joinProblems (join: Join, pool: Pool, network?: 'testnet' | 'mainnet'): string[] {
  const problems: string[] = []
  if (join.poolId !== pool.id) problems.push('belongs to another pool')
  if (join.amount < MIN_SHARE || join.amount > COLLATERAL) problems.push('amount out of range')
  if (join.inputs.length === 0) problems.push('no inputs')
  // Script rules run on live data only: the mock backend seeds placeholder addresses that cannot decode
  if (network != null) {
    for (const [role, address] of [['refund', join.refundAddress], ['reward', join.rewardAddress ?? '']] as const) {
      problems.push(...payoutScriptProblems({
        role, address, ownerAddress: join.ownerAddress, votingAddress: pool.votingAddress, network, strict: true
      }))
    }
  }
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

  // One stake per identity is a product rule, not a Core rule — but a lock that names two joins from
  // the same identity can never be signed, so it is as fatal as a duplicate owner key.
  const identities = new Set<string>()
  for (const join of joins) {
    if (identities.has(join.ownerId)) problems.push('Two shares come from the same identity')
    identities.add(join.ownerId)
  }

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

/**
 * Rules a `pool` document must satisfy before its terms can reach a ProRegTx. The contract bounds
 * nothing, so a document written by another client (or a tampered one) is checked here on every read,
 * not only in the creation form.
 */
export function poolTermProblems (pool: Pool, network: 'testnet' | 'mainnet'): string[] {
  const problems: string[] = []
  if (!isBlsPublicKey(pool.operatorPubKey)) problems.push('The operator key is not 96 hex characters')
  else if (!isOperatorKeyPoint(pool.operatorPubKey)) problems.push('The operator key is not a valid BLS public key')
  if (!isAddressShape(pool.votingAddress, network, true, true)) problems.push('The voting address is not a P2PKH address on this network')
  if (!Number.isInteger(pool.operatorReward) || pool.operatorReward < 0 || pool.operatorReward > MAX_OPERATOR_REWARD_BP) {
    problems.push(`The operator reward is ${pool.operatorReward}, outside 0–${MAX_OPERATOR_REWARD_BP} basis points`)
  }
  if (!Number.isInteger(pool.earlyPeriodBlocks) || pool.earlyPeriodBlocks < 0 || pool.earlyPeriodBlocks > MAX_EARLY_PERIOD_BLOCKS) {
    problems.push(`The early period is ${pool.earlyPeriodBlocks} blocks, outside 0–${MAX_EARLY_PERIOD_BLOCKS}`)
  }
  if (!Number.isInteger(pool.earlyPenalty) || pool.earlyPenalty < 0 || pool.earlyPenalty >= MIN_SHARE) {
    problems.push('The early penalty must be zero or more and below 100 DASH')
  } else if (pool.earlyPeriodBlocks === 0 && pool.earlyPenalty !== 0) {
    problems.push('The pool charges an early penalty but has no early period')
  }
  if (!Number.isInteger(pool.fee) || pool.fee <= 0) problems.push('The registration fee is not a positive amount')
  if (pool.feePayer != null && pool.feePayer !== 'creator' && pool.feePayer !== 'members') problems.push('The registration fee payer is unknown')
  if (pool.service != null && pool.service !== '' && !isServiceAddress(pool.service)) problems.push('The service address is not an IPv4 address and port')
  return problems
}

export interface ShareOwnerConflict {
  /** The join whose owner address is reused, oldest first */
  joinId: string
  address: string
  poolId: string
  poolName: string
  /** The other pool already published its lock, so its share table is committed and will register */
  locked: boolean
}

/**
 * Owner addresses another pool already collects shares with.
 *
 * Only one of two pools naming the same key can ever register, so a conflict with a pool that has
 * already locked is fatal — that pool's share table is committed and will be broadcast, and the
 * registration that loses is rejected with bad-protx-dup-key. A conflict with a pool that has not
 * locked is a warning: the first to lock wins, and blocking both would deadlock them. The on-chain
 * tier (a key already held by a live masternode) needs the index, not documents.
 */
export function shareOwnerConflicts (
  joins: Join[],
  otherPools: Array<{ id: string, name: string, ownerAddresses: string[], locked?: boolean }>,
  ownPoolId: string
): ShareOwnerConflict[] {
  const taken = new Map<string, { id: string, name: string, locked: boolean }>()
  for (const other of otherPools) {
    if (other.id === ownPoolId) continue
    for (const address of other.ownerAddresses) {
      if (!taken.has(address)) taken.set(address, { id: other.id, name: other.name, locked: other.locked === true })
    }
  }

  const conflicts: ShareOwnerConflict[] = []
  for (const join of joins) {
    const other = taken.get(join.ownerAddress)
    if (other != null) {
      conflicts.push({ joinId: join.id, address: join.ownerAddress, poolId: other.id, poolName: other.name, locked: other.locked })
    }
  }
  return conflicts
}

/**
 * Shares whose owner key is already a live masternode's `keyIDOwner`. Core keeps share owner keys in
 * the same unique namespace, so the registration is rejected with bad-protx-dup-key.
 *
 * The set comes from an optional index: a caller that cannot reach it must pass null and skip the
 * check entirely, because an empty map would say "nothing is taken" and hide the rule.
 */
export function onchainOwnerProblems (joins: Join[], owners: Map<string, string>): string[] {
  return joins.flatMap((join, i) => {
    const proTxHash = owners.get(join.ownerAddress)
    if (proTxHash == null) return []
    return [
      `Share ${i + 1} uses ${join.ownerAddress}, already the owner key of masternode ${proTxHash.slice(0, 8)}…, so the network will reject this registration`
    ]
  })
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
