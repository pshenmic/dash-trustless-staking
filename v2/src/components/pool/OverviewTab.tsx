import type { ReactNode } from 'react'
import type { PoolState } from '../../data/queries'
import { blocksToDuration, formatBasisPoints, formatDash, formatDateTime } from '../../lib/format'
import { feeShares } from '../../lib/rules'
import { findOperatorKey, findProvider, operatorId } from '../../operators'
import { Flag, hasLocation, locationText } from '../Flag'
import { cn, IdentifierValue, KeyValue, KeyValueList, Notice } from '../ui'

const STEPS = ['Open', 'Locked', 'Signed', 'Registered'] as const

function currentStep (state: PoolState): number {
  if (state.status === 'NEW') return 0
  if (state.status === 'SIGNING') return state.stage === 'broadcast' || state.stage === 'confirming' ? 2 : 1
  return 3
}

export function OverviewTab ({ state }: { state: PoolState }): ReactNode {
  const { pool } = state
  const step = currentStep(state)
  const members = Math.max(state.members.length, 2)
  const shares = feeShares(pool.fee, members)

  return (
    <div className='flex flex-col gap-8'>
      <ol className='grid grid-cols-4 gap-2' aria-label='Pool progress'>
        {STEPS.map((label, i) => (
          <li key={label} className='flex flex-col gap-2'>
            <span className={cn('h-1.5 rounded-full', i <= step ? 'bg-brand' : 'bg-brand-soft')} />
            <span className={cn('text-tag', i === step ? 'font-bold text-fg' : 'text-muted')}>{label}</span>
          </li>
        ))}
      </ol>

      {pool.service == null && state.masternode == null && state.status !== 'DISSOLVED' && (
        <Notice tone='info' title='No server address yet'>
          The masternode will register inactive (PoSe-banned) and start earning once the operator sets its address
          with their operator key.
        </Notice>
      )}

      {pool.earlyPenalty === 0 && (
        <Notice tone='warning' title='No early exit penalty'>
          Any member can dissolve the masternode at any time, at no cost beyond the transaction fee.
        </Notice>
      )}

      {state.finalTx != null && (
        <section>
          <h3 className='mb-1 text-small font-bold text-muted'>Registration transaction</h3>
          <KeyValueList>
            <KeyValue label='ProTx hash' wide>
              <IdentifierValue
                value={state.finalTx.txid}
                href={`https://testnet.dashscan.io/transactions/${state.finalTx.txid}`}
                label='ProTx hash'
              />
            </KeyValue>
            <KeyValue label='Status'>
              {state.regTx == null ? 'Not broadcast' : state.regTx.height == null ? 'In the mempool, waiting for a block' : `Mined in block ${state.regTx.height.toLocaleString('en-US')}`}
            </KeyValue>
            <KeyValue label='Registered'>{state.registeredHeight == null ? '—' : `Block ${state.registeredHeight.toLocaleString('en-US')}`}</KeyValue>
            <KeyValue label='Masternode list'>
              {state.regTx?.height == null
                ? '—'
                : state.status === 'REGISTERED'
                  ? 'Listed, not active yet — no service address'
                  : state.masternode == null ? 'Not in the list yet' : state.masternode.isValid ? 'Valid' : 'Not valid (PoSe-banned or revoked)'}
            </KeyValue>
            {state.masternode != null && (
              <KeyValue
                label='Current IP:PORT'
                hint={state.masternode.service !== '' && state.masternode.service !== (pool.service ?? '') ? 'Changed by the operator since registration' : undefined}
              >
                {state.masternode.service === '' ? 'Not set' : <span className='font-mono'>{state.masternode.service}</span>}
              </KeyValue>
            )}
          </KeyValueList>
        </section>
      )}

      <section>
        <h3 className='mb-1 text-small font-bold text-muted'>Terms</h3>
        <p className='mb-2 text-small text-muted'>Set by the creator when the pool was created. They can never change.</p>
        <KeyValueList>
          {findProvider(pool.operatorPubKey) != null && (
            <KeyValue label='Operator' hint='Runs the node and holds its operator key'>
              {findProvider(pool.operatorPubKey)?.name} <span className='font-mono font-medium text-muted'>· {operatorId(pool.operatorPubKey)}</span>
            </KeyValue>
          )}
          {hasLocation(pool) && (
            <KeyValue label='Location'>
              <span className='inline-flex items-center gap-2'>
                <Flag country={pool.location} />
                {locationText(pool.location, findOperatorKey(pool.operatorPubKey)?.country === pool.location ? findOperatorKey(pool.operatorPubKey)?.city : undefined)}
              </span>
            </KeyValue>
          )}
          <KeyValue label='Starting IP:PORT' hint='The operator can change it at any time'>
            {pool.service == null ? 'Set after registration' : <span className='font-mono'>{pool.service}</span>}
          </KeyValue>
          <KeyValue label='Operator fee' hint='Taken from the masternode reward before members are paid'>{formatBasisPoints(pool.operatorReward)}</KeyValue>
          <KeyValue label='Early period' hint={pool.earlyPeriodBlocks === 0 ? undefined : `${pool.earlyPeriodBlocks.toLocaleString('en-US')} blocks after registration`}>
            {pool.earlyPeriodBlocks === 0 ? 'None' : blocksToDuration(pool.earlyPeriodBlocks)}
          </KeyValue>
          <KeyValue label='Early exit penalty' hint='Paid by a member who dissolves alone during the early period, shared by the others'>
            {pool.earlyPenalty === 0 ? 'None' : formatDash(pool.earlyPenalty)}
          </KeyValue>
          <KeyValue label='Registration fee' hint={`Split between members: ${formatDash(shares[0])} each with ${members} members`}>{formatDash(pool.fee)}</KeyValue>
          <KeyValue label='Voting address'><span className='font-mono text-small break-all'>{pool.votingAddress}</span></KeyValue>
          <KeyValue label='Operator key' wide>
            <IdentifierValue value={pool.operatorPubKey} label='operator key' />
          </KeyValue>
          <KeyValue label='Created'>{formatDateTime(pool.createdAt)}</KeyValue>
          <KeyValue label='Pool ID' wide>
            <IdentifierValue value={pool.id} label='pool ID' />
          </KeyValue>
        </KeyValueList>
      </section>
    </div>
  )
}
