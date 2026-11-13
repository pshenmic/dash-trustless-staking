import { describe, expect, test } from 'vitest'
import { actionBarState, type ActionBarRole, type ActionKind, type ActionTone } from './actionBar.js'
import type { MemberState, PoolState } from '../data/queries.js'
import type { Consent, Funding, Join, Pool } from './types.js'

const DASH = 100_000_000

const pool: Pool = {
  id: 'pool-1',
  ownerId: 'creator',
  createdAt: 1_700_000_000_000,
  name: 'Test pool',
  description: '',
  operatorPubKey: 'a'.repeat(96),
  votingAddress: 'yVoting',
  operatorReward: 500,
  earlyPeriodBlocks: 17_280,
  earlyPenalty: 50_000_000,
  fee: 20_000,
  feePayer: 'creator'
}

function join (ownerId: string, amount: number, patch: Partial<Join> = {}): Join {
  return {
    id: `join-${ownerId}`,
    poolId: pool.id,
    ownerId,
    createdAt: 1,
    amount,
    ownerAddress: 'yOwner',
    refundAddress: 'yRefund',
    inputs: [],
    changeAddress: 'yChange',
    ...patch
  }
}

function consent (ownerId: string): Consent {
  return { id: `consent-${ownerId}`, ownerId, createdAt: 1, lockId: 'lock-1', signature: 'sig' }
}

function funding (ownerId: string): Funding {
  return { id: `funding-${ownerId}`, ownerId, createdAt: 1, lockId: 'lock-1', scriptSigs: [] }
}

function member (ownerId: string, amount: number, signed: { consent?: boolean, funding?: boolean } = {}): MemberState {
  return {
    join: join(ownerId, amount),
    shareIndex: 0,
    consent: signed.consent === true ? consent(ownerId) : null,
    funding: signed.funding === true ? funding(ownerId) : null
  }
}

function stateFixture (patch: Partial<PoolState> = {}): PoolState {
  return {
    pool,
    joins: [],
    lock: null,
    members: [],
    feeFunding: null,
    lockProblems: [],
    registration: null,
    finalTx: null,
    regTx: null,
    masternode: null,
    registeredHeight: null,
    height: 1_000,
    status: 'NEW',
    dissolutionTxid: null,
    stage: null,
    consentCount: 0,
    fundingCount: 0,
    operatorKey: { masternode: null, otherPools: [] },
    prevouts: new Map(),
    broadcastProblems: [],
    ...patch
  }
}

function role (patch: Partial<ActionBarRole> = {}): ActionBarRole {
  return { me: 'viewer', isCreator: false, myJoin: null, myMember: null, ...patch }
}

interface Case {
  state: PoolState
  role: ActionBarRole
}

const rows: Array<[string, () => Case, string, ActionKind | null, ActionTone]> = [
  ['lock problems', () => ({
    state: stateFixture({ status: 'SIGNING', lockProblems: ['A selected join is missing'] }),
    role: role()
  }), 'This lock cannot form', null, 'red'],

  ['new, visitor', () => ({
    state: stateFixture({ status: 'NEW', joins: [join('a', 250 * DASH)] }),
    role: role({ me: null })
  }), 'Join this pool', 'login', 'blue'],

  ['new, joined', () => {
    const mine = join('viewer', 250 * DASH)
    return {
      state: stateFixture({ status: 'NEW', joins: [mine] }),
      role: role({ myJoin: mine })
    }
  }, 'You joined 250 DASH', null, 'peach'],

  ['new, creator short', () => ({
    state: stateFixture({ status: 'NEW', joins: [join('a', 100 * DASH)] }),
    role: role({ isCreator: true })
  }), 'Waiting for members', 'join', 'peach'],

  ['new, creator full', () => ({
    state: stateFixture({ status: 'NEW', joins: [join('a', 1_000 * DASH)] }),
    role: role({ isCreator: true })
  }), 'Ready to lock', 'lock', 'blue'],

  ['new, creator joined short', () => {
    const mine = join('creator', 250 * DASH)
    return {
      state: stateFixture({ status: 'NEW', joins: [mine] }),
      role: role({ me: 'creator', isCreator: true, myJoin: mine })
    }
  }, 'Waiting for members', null, 'peach'],

  ['new, creator joined full', () => {
    const mine = join('creator', 1_000 * DASH)
    return {
      state: stateFixture({ status: 'NEW', joins: [mine] }),
      role: role({ me: 'creator', isCreator: true, myJoin: mine })
    }
  }, 'Ready to lock', 'lock', 'blue'],

  ['signing, logged out', () => ({
    state: stateFixture({ status: 'SIGNING', stage: 'consent' }),
    role: role({ me: null })
  }), 'Signing in progress', 'login', 'neutral'],

  ['signing, not selected', () => {
    const mine = join('viewer', 100 * DASH)
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'consent', joins: [mine] }),
      role: role({ myJoin: mine })
    }
  }, 'You were not selected', null, 'grey'],

  ['signing, never joined', () => ({
    state: stateFixture({ status: 'SIGNING', stage: 'consent' }),
    role: role()
  }), 'Signing in progress', null, 'neutral'],

  ['consent due', () => {
    const me = member('viewer', 250 * DASH)
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'consent', members: [me] }),
      role: role({ myMember: me })
    }
  }, 'Sign the consent', 'consent', 'peach'],

  ['funding due', () => {
    const me = member('viewer', 250 * DASH, { consent: true })
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'funding', members: [me], consentCount: 1 }),
      role: role({ myMember: me })
    }
  }, 'Sign your coins', 'funding', 'peach'],

  ['fee due', () => {
    const other = member('other', 500 * DASH, { consent: true, funding: true })
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'funding', members: [other], consentCount: 1, fundingCount: 1 }),
      role: role({ isCreator: true })
    }
  }, 'Sign the registration fee', 'fee', 'peach'],

  ['fee due, creator is also a member', () => {
    const me = member('creator', 500 * DASH, { consent: true, funding: true })
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'funding', members: [me], consentCount: 1, fundingCount: 1 }),
      role: role({ me: 'creator', isCreator: true, myMember: me })
    }
  }, 'Sign the registration fee', 'fee', 'peach'],

  ['fee due, creator was not selected', () => {
    const other = member('other', 500 * DASH, { consent: true, funding: true })
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'funding', members: [other], consentCount: 1, fundingCount: 1 }),
      role: role({ me: 'creator', isCreator: true, myJoin: join('creator', 100 * DASH) })
    }
  }, 'Sign the registration fee', 'fee', 'peach'],

  ['my part done', () => {
    const me = member('viewer', 250 * DASH, { consent: true })
    return {
      state: stateFixture({ status: 'SIGNING', stage: 'consent', members: [me], consentCount: 1 }),
      role: role({ myMember: me })
    }
  }, 'Your part is done', null, 'mint'],

  ['broadcast blocked', () => ({
    state: stateFixture({ status: 'SIGNING', stage: 'broadcast', broadcastProblems: ['An input was already spent'] }),
    role: role()
  }), 'Not ready to broadcast', 'broadcast', 'red'],

  ['broadcast ready', () => ({
    state: stateFixture({ status: 'SIGNING', stage: 'broadcast' }),
    role: role()
  }), 'All signatures collected', 'broadcast', 'mint'],

  ['confirming', () => ({
    state: stateFixture({ status: 'SIGNING', stage: 'confirming' }),
    role: role()
  }), 'Waiting for a block', null, 'mint'],

  ['registered', () => ({
    state: stateFixture({ status: 'REGISTERED' }),
    role: role()
  }), 'Waiting for the operator', null, 'blue'],

  ['formed, member', () => {
    const me = member('viewer', 250 * DASH)
    return {
      state: stateFixture({ status: 'FORMED', members: [me] }),
      role: role({ myMember: me })
    }
  }, 'Masternode is running', null, 'mint'],

  ['formed, visitor', () => ({
    state: stateFixture({ status: 'FORMED' }),
    role: role()
  }), 'Masternode is running', null, 'mint'],

  ['error', () => ({
    state: stateFixture({ status: 'ERROR' }),
    role: role()
  }), 'Masternode is not valid', null, 'red'],

  ['dissolving', () => ({
    state: stateFixture({ status: 'DISSOLVING' }),
    role: role()
  }), 'Dissolving', null, 'grey'],

  ['dissolved', () => ({
    state: stateFixture({ status: 'DISSOLVED' }),
    role: role()
  }), 'Dissolved', null, 'grey']
]

describe('actionBarState', () => {
  test.each(rows)('%s', (_name, setup, title, kind, tone) => {
    const { state, role: r } = setup()
    const model = actionBarState(state, r)
    expect(model.title).toBe(title)
    expect(model.action?.kind ?? null).toBe(kind)
    expect(model.tone).toBe(tone)
  })

  test('a new pool ring is the joined percentage', () => {
    const model = actionBarState(stateFixture({ joins: [join('a', 500 * DASH)] }), role())
    expect(model.ring).toEqual({ label: '50%', value: 50, max: 100 })
  })

  test('a signing ring counts consents, fundings and the creator fee step', () => {
    const model = actionBarState(
      stateFixture({
        status: 'SIGNING',
        stage: 'funding',
        members: [member('a', 500 * DASH, { consent: true, funding: true }), member('b', 500 * DASH, { consent: true })],
        consentCount: 2,
        fundingCount: 1
      }),
      role()
    )
    expect(model.ring).toEqual({ label: '3/5', value: 3, max: 5 })
  })

  test('a blocked broadcast is disabled', () => {
    const model = actionBarState(
      stateFixture({ status: 'SIGNING', stage: 'broadcast', broadcastProblems: ['An input was already spent'] }),
      role()
    )
    expect(model.action).toEqual({ kind: 'broadcast', label: 'Broadcast', disabled: true })
  })

  test('a member is told where their rewards go, a visitor is told about each member', () => {
    const me = member('viewer', 250 * DASH)
    expect(actionBarState(stateFixture({ status: 'FORMED' }), role()).subtitle).toContain('each member')
    expect(actionBarState(stateFixture({ status: 'FORMED', members: [me] }), role({ myMember: me })).subtitle).toContain('your reward')
  })
})