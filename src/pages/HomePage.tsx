import { Accordion } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Dash } from '../components/bits'
import { LockedChart } from '../components/home/LockedChart'
import { errorMessage } from '../components/Toast'
import { Notice, Skeleton, Stat } from '../components/ui'
import { useHomeStats } from '../hooks/data'
import { FAQ } from '../lib/faq'

const STEPS = [
  { title: 'Join a pool', text: 'Pick a pool, choose your share (from 100 DASH) and publish your join. Your coins stay in your wallet.' },
  { title: 'The creator locks it', text: 'When joins reach 1000 DASH, the pool creator selects the members. The terms are final from here.' },
  { title: 'Everyone signs', text: 'Each member checks the transaction in their own wallet, signs a consent, then signs their coins.' },
  { title: 'Earn rewards', text: 'The masternode registers on chain. Dash pays every member their share of the rewards directly.' }
]

const GUARANTEES = [
  { title: 'Your refund address is fixed forever', text: 'Set when you join. Dash consensus only ever refunds your coins to it.' },
  { title: 'Leave any time', text: 'Dissolve on your own, without anyone’s permission. Early in the pool’s life you pay the penalty it states up front.' },
  { title: 'Rewards paid by the protocol', text: 'Each block reward is split by share and sent straight to your address. Nobody handles your earnings.' },
  { title: 'The creator can’t touch funds', text: 'The creator runs the node and votes. Changing keys takes every member’s signature.' }
]

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function HomePage (): ReactNode {
  const { stats, running, error } = useHomeStats()

  return (
    <div className='flex flex-col gap-14 md:gap-20'>
      <section className='relative overflow-hidden rounded-[32px] bg-brand px-6 py-10 text-white md:px-12 md:py-16'>
        <HeroGraphic />
        <div className='relative max-w-xl'>
          <span className='inline-block rounded-full border border-white/40 px-3 py-1 text-tag'>Shared masternodes · Dash Core v24</span>
          <h1 className='mt-5 text-display'>Run a Dash masternode together</h1>
          <p className='mt-4 text-lead text-white/85'>
            Pool your DASH with others to reach the 1000 DASH collateral. No custodian, no multisig: Dash itself
            enforces refunds and pays every member directly.
          </p>
          <div className='mt-8 flex flex-wrap gap-3'>
            <Link to='/pools'><Button colorScheme='mint' size='md' className='font-bold'>Browse pools</Button></Link>
            <Link to='/pools/new'><Button colorScheme='halfWhite' size='md' className='font-bold'>Create a pool</Button></Link>
          </div>
        </div>
      </section>

      {error != null && (
        <Notice tone='error' title='Could not load network stats'>{errorMessage(error)}</Notice>
      )}

      <section className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {stats == null
          ? [0, 1, 2, 3].map(i => <Skeleton key={i} className='h-28' />)
          : (
            <>
              <Stat label='DASH pooled' value={<Dash duffs={stats.pooled} />} hint={plural(stats.openPools, 'open pool')} />
              <Stat label='DASH locked' value={<Dash duffs={stats.locked} />} hint={plural(stats.lockedPools, 'locked pool')} />
              <Stat
                label='Masternodes running'
                value={running ?? '—'}
                hint={running == null ? 'Syncing the masternode list' : stats.lockedPools === 0 ? 'No locked pools yet' : 'Registered and valid'}
              />
              <Stat
                label='Shares'
                value={stats.shares}
                hint={`${plural(stats.members, 'member')} · ${plural(stats.pools, 'pool')} opened`}
              />
            </>
            )}
      </section>

      <section>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <h2 className='text-title'>DASH locked</h2>
          <Link to='/stats' className='text-small font-bold text-brand-ink hover:underline'>All statistics →</Link>
        </div>
        <p className='mt-2 text-small text-muted'>The DASH pool creators have locked over time. A locked pool still has to be signed and registered on chain.</p>
        <div className='mt-6'>
          {stats == null ? <Skeleton className='h-64' /> : <LockedChart points={stats.lockedPoints} />}
        </div>
      </section>

      <section>
        <h2 className='text-title'>How it works</h2>
        <ol className='mt-6 grid grid-cols-1 gap-4 md:grid-cols-4'>
          {STEPS.map((step, i) => (
            <li key={step.title} className='rounded-3xl border border-line/60 bg-surface p-5 shadow-card'>
              <span className='flex size-9 items-center justify-center rounded-full bg-brand-soft font-extrabold text-brand-ink'>{i + 1}</span>
              <h3 className='mt-4 text-lead font-extrabold tracking-[-0.02em]'>{step.title}</h3>
              <p className='mt-2 text-small text-muted'>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className='grid grid-cols-1 gap-4 md:grid-cols-2'>
        {GUARANTEES.map((g, i) => (
          <div key={g.title} className={i === 0 ? 'rounded-3xl bg-midnight p-6 text-white md:p-8 dark:bg-surface-2' : 'rounded-3xl border border-line/60 bg-surface p-6 shadow-card md:p-8'}>
            <h3 className='text-section'>{g.title}</h3>
            <p className={i === 0 ? 'mt-3 text-white/80' : 'mt-3 text-muted'}>{g.text}</p>
          </div>
        ))}
      </section>

      <section>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <h2 className='text-title'>Questions</h2>
          <Link to='/guide#faq' className='text-small font-bold text-brand-ink hover:underline'>Read the guide →</Link>
        </div>
        <div className='mt-6 flex flex-col gap-2'>
          {FAQ.map(item => (
            <Accordion key={item.q} title={item.q} border>
              <p className='text-small text-muted'>{item.a}</p>
            </Accordion>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Repeated rounded bars, echoing the brand's 3D "repetition" motif without shipping images */
function HeroGraphic (): ReactNode {
  return (
    <svg className='pointer-events-none absolute -right-24 -bottom-24 h-[420px] w-[520px] opacity-90 md:right-0' viewBox='0 0 520 420' aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <rect
          key={i}
          x={40 + i * 32}
          y={60 + Math.abs(7 - i) * 18}
          width='22'
          height={300 - Math.abs(7 - i) * 22}
          rx='11'
          fill={i % 3 === 0 ? '#60F6D2' : '#FFFFFF'}
          opacity={0.18 + (i % 4) * 0.08}
        />
      ))}
    </svg>
  )
}