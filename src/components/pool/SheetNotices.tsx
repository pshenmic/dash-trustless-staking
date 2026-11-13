import type { ReactNode } from 'react'
import type { PoolState } from '../../data/queries'
import { Notice } from '../ui'
import { OperatorKeyNotice } from './OperatorKeyNotice'
import type { PoolRole } from './role'

/** Blocking and explanatory notices live in the sheet body, above the tabs, not in the action bar */
export function SheetNotices ({ state, role }: { state: PoolState, role: PoolRole }): ReactNode {
  const { pool } = state
  const beforeRegistration = state.status === 'NEW' || state.status === 'SIGNING'

  return (
    <div className='flex flex-col gap-2'>
      {beforeRegistration && <OperatorKeyNotice usage={state.operatorKey} />}

      {state.lockProblems.length > 0 && (
        <Notice tone='error' title='This lock cannot form'>
          {state.lockProblems.join('. ')}. The creator has to start a new pool.
        </Notice>
      )}

      {state.lock != null && role.myJoin != null && role.myMember == null && (
        <Notice tone='info' title='You were not selected'>
          The creator locked the pool with other members. Your coins were never used.
        </Notice>
      )}

      {beforeRegistration && pool.service == null && (
        <Notice tone='info' title='No server address yet'>
          The masternode will register inactive (PoSe-banned) and start earning once the operator sets its address
          with their operator key.
        </Notice>
      )}

      {pool.earlyPenalty === 0 && state.status !== 'DISSOLVED' && (
        <Notice tone='warning' title='No early exit penalty'>
          Any member can dissolve the masternode at any time, at no cost beyond the transaction fee.
        </Notice>
      )}

      <RunningNotice state={state} />
    </div>
  )
}

function RunningNotice ({ state }: { state: PoolState }): ReactNode {
  if (state.status === 'FORMED') {
    return (
      <Notice tone='success' title='Masternode is running'>
        Rewards go straight to each member’s reward address.
      </Notice>
    )
  }
  if (state.status === 'DISSOLVING') {
    return (
      <Notice tone='info' title='Dissolution broadcast'>
        The dissolution is confirming. Every share goes back to its refund address once the transaction is in a
        chainlocked block — the masternode list keeps showing the old entry for a few minutes until then.
      </Notice>
    )
  }
  if (state.status === 'REGISTERED') {
    return (
      <Notice tone='info' title='Registered, waiting for the operator'>
        The registration is on chain and the masternode is listed, but inactive until the operator sets its
        address with a ProUpServTx — within an hour of registration to stay in good standing.
      </Notice>
    )
  }
  if (state.status === 'ERROR') {
    if (state.masternode?.service === '') {
      return (
        <Notice tone='warning' title='Waiting for the operator'>
          The masternode registered without an address, so it starts inactive. It begins earning once the operator
          sets its address with a ProUpServTx.
        </Notice>
      )
    }
    return (
      <Notice tone='error' title='Masternode is not valid'>
        It was PoSe-banned or revoked and earns nothing until the operator fixes the node and sends a ProUpServTx.
      </Notice>
    )
  }
  return null
}