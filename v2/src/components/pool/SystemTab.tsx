import { Button } from '../Button'
import { useState, type ReactNode } from 'react'
import type { MemberState, PoolState } from '../../data/queries'
import { formatDash } from '../../lib/format'
import { rewardSharePercent } from '../../lib/rules'
import { Dash } from '../bits'
import { DissolveDialog } from '../DissolveDialog'
import { KeyValue, KeyValueList, Notice } from '../ui'

/**
 * System tab: the member's own stake and the destructive exit. It is only mounted for share owners,
 * so a visitor never sees a dissolve control they cannot use.
 */
export function SystemTab ({ state, member }: { state: PoolState, member: MemberState }): ReactNode {
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const inEarlyPeriod = state.registeredHeight != null &&
    state.height - state.registeredHeight < state.pool.earlyPeriodBlocks
  const canDissolve = state.status !== 'SIGNING' && state.status !== 'DISSOLVED'

  return (
    <div className='flex flex-col gap-6'>
      <div className='rounded-2xl bg-surface-2 p-4'>
        <div className='text-small text-muted'>Your share</div>
        <div className='mt-1 text-[24px] leading-7 font-extrabold tracking-[-0.03em]'><Dash duffs={member.join.amount} /></div>
        <div className='mt-1 text-small text-muted'>
          {rewardSharePercent(member.join.amount, state.pool.operatorReward).toFixed(2)}% of the masternode rewards
        </div>
      </div>

      <section className='flex flex-col gap-3'>
        <div>
          <h3 className='text-small font-bold'>Leave the pool</h3>
          <p className='mt-1 text-small text-muted'>
            A unilateral dissolution refunds every member to their own refund address and ends the masternode. It needs
            nobody else’s permission and is authorised by your share owner key alone.
          </p>
        </div>

        <KeyValueList>
          <KeyValue label='Your refund address' wide>
            <span className='font-mono text-small break-all'>{member.join.refundAddress}</span>
          </KeyValue>
          <KeyValue label='Early exit penalty'>
            {state.pool.earlyPenalty === 0
              ? 'None'
              : `${formatDash(state.pool.earlyPenalty)}${state.registeredHeight == null ? '' : inEarlyPeriod ? ' (applies now)' : ' (early period over)'}`}
          </KeyValue>
          <KeyValue label='Network fee'>Paid by you, on top of any penalty</KeyValue>
        </KeyValueList>

        {canDissolve && inEarlyPeriod && state.pool.earlyPenalty !== 0 && (
          <Notice tone='warning' title='You are inside the early period'>
            Leaving now pays {formatDash(state.pool.earlyPenalty)} out of your share, split between the other members.
          </Notice>
        )}

        <div>
          <Button
            colorScheme='red'
            variant='outline'
            size='md'
            disabled={!canDissolve}
            onClick={() => setDissolveOpen(true)}
          >
            Dissolve the masternode…
          </Button>
          {!canDissolve && (
            <p className='mt-1 text-small text-muted'>
              {state.status === 'DISSOLVED' ? 'This pool is already dissolved.' : 'The masternode is not registered yet.'}
            </p>
          )}
        </div>
      </section>

      <DissolveDialog state={state} member={member} open={dissolveOpen} onOpenChange={setDissolveOpen} />
    </div>
  )
}