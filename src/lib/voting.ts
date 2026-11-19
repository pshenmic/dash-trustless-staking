import type { Join, Network, Vote, VoteOutcome } from './types'
import { compareDocumentIds } from './documentId'

/*
 * The governance voting rules shared by the dapp, the operator watcher and any auditor
 * (docs/superpowers/specs/2026-11-19-pool-governance-voting-design.md). A Core vote is a standing
 * choice per proposal with no cycle field; the pool's single vote is the stake-weighted aggregate
 * of its locked members' latest choices, an exact tie abstaining. Superblock parameters are
 * Core's chainparams (mainnet 16616/1662/614820, testnet 24/8/4200).
 */

export const SUPERBLOCK_PARAMS: Record<Network, { cycle: number, maturityWindow: number, startBlock: number }> = {
  testnet: { cycle: 24, maturityWindow: 8, startBlock: 4200 },
  mainnet: { cycle: 16616, maturityWindow: 1662, startBlock: 614820 }
}

/** Latest choice per (proposalHash, ownerId): greatest createdAt, equal timestamps → greater id bytes */
export function latestChoices (votes: Vote[]): Vote[] {
  const latest = new Map<string, Vote>()
  for (const v of votes) {
    const key = `${v.proposalHash}:${v.ownerId}`
    const current = latest.get(key)
    if (current == null || v.createdAt > current.createdAt || (v.createdAt === current.createdAt && compareDocumentIds(current.id, v.id) < 0)) {
      latest.set(key, v)
    }
  }
  return [...latest.values()].sort((a, b) => a.proposalHash.localeCompare(b.proposalHash) || a.ownerId.localeCompare(b.ownerId))
}

/**
 * Latest choices of the locked members only. The contract lets anyone publish a vote document, so
 * the display must filter to the member set — a stranger's immutable doc must not surface a proposal.
 */
export function latestMemberChoices (votes: Vote[], members: Join[]): Vote[] {
  const ids = new Set(members.map(m => m.ownerId))
  return latestChoices(votes.filter(v => ids.has(v.ownerId)))
}

/** Stake-weighted aggregate of one proposal's latest choices; tie → ABSTAIN, no counted choices → null */
export function tally (choices: Vote[], members: Join[]): VoteOutcome | null {
  const weight = new Map(members.map(m => [m.ownerId, m.amount]))
  const sums: Record<VoteOutcome, number> = { 1: 0, 2: 0, 3: 0 }
  let counted = 0
  for (const c of choices) {
    const w = weight.get(c.ownerId)
    if (w == null) continue
    sums[c.outcome] += w
    counted += w
  }
  if (counted === 0) return null
  if (sums[1] > sums[2]) return 1
  if (sums[2] > sums[1]) return 2
  return 3
}

/** Core's rule (superblock.cpp IsValidBlockHeight / GetNearestSuperblocksHeights): strictly above height */
export function nextSuperblockHeight (height: number, network: Network): number {
  const { cycle, startBlock } = SUPERBLOCK_PARAMS[network]
  const first = startBlock + (cycle - startBlock % cycle) % cycle
  if (height < first) return first
  return height - height % cycle + cycle
}

/** Height where choices for the next superblock lock: the start of its maturity window */
export function lockHeight (height: number, network: Network): number {
  return nextSuperblockHeight(height, network) - SUPERBLOCK_PARAMS[network].maturityWindow
}

export function cycleLocked (height: number, network: Network): boolean {
  return lockHeight(height, network) <= height
}

export function isProposalHash (value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value)
}

/** Human label for an outcome; null/undefined means the member has not recorded a choice */
export function outcomeLabel (outcome: VoteOutcome | null | undefined): string {
  return outcome === 1 ? 'YES' : outcome === 2 ? 'NO' : outcome === 3 ? 'ABSTAIN' : 'No choice'
}

/** Votes grouped by pool, in insertion order */
export function groupVotesByPool (votes: Vote[]): Map<string, Vote[]> {
  const byPool = new Map<string, Vote[]>()
  for (const v of votes) {
    const list = byPool.get(v.poolId) ?? []
    list.push(v)
    byPool.set(v.poolId, list)
  }
  return byPool
}

export interface PoolVoteSummary {
  choices: Vote[]
  tally: VoteOutcome | null
  votedStake: number
  totalStake: number
}

/** Canonical stake-weighted summary of one pool's members' latest choices on a proposal */
export function poolVoteSummary (members: Join[], votes: Vote[]): PoolVoteSummary {
  const choices = latestMemberChoices(votes, members)
  const amountOf = new Map(members.map(m => [m.ownerId, m.amount]))
  return {
    choices,
    tally: tally(choices, members),
    votedStake: choices.reduce((s, c) => s + (amountOf.get(c.ownerId) ?? 0), 0),
    totalStake: members.reduce((s, m) => s + m.amount, 0)
  }
}

export interface ProposalActivity {
  proposalHash: string
  lastActivity: number
  poolCount: number
  choiceCount: number
  yes: number
  no: number
  abstain: number
}

/**
 * Raw recorded-choice activity per proposal for the network feed — NOT a tally: it counts every
 * document (superseded choices and any publisher included), so it stays a single cheap query.
 */
export function proposalActivity (votes: Vote[]): ProposalActivity[] {
  const byProposal = new Map<string, Vote[]>()
  for (const v of votes) {
    const list = byProposal.get(v.proposalHash) ?? []
    list.push(v)
    byProposal.set(v.proposalHash, list)
  }
  return [...byProposal.entries()].map(([proposalHash, group]) => ({
    proposalHash,
    lastActivity: Math.max(...group.map(v => v.createdAt)),
    poolCount: new Set(group.map(v => v.poolId)).size,
    choiceCount: group.length,
    yes: group.filter(v => v.outcome === 1).length,
    no: group.filter(v => v.outcome === 2).length,
    abstain: group.filter(v => v.outcome === 3).length
  })).sort((a, b) => b.lastActivity - a.lastActivity)
}