import { Avatar, CopyButton } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { IdentityChip, StatusBadge } from '../components/bits'
import { Card, EmptyState, Loading, SectionTitle, Stars, Stat } from '../components/ui'
import { useCreatorProfile, useUsername } from '../hooks/data'
import { relativeTime, shortId } from '../lib/format'

export function CreatorPage (): ReactNode {
  const { identityId = '' } = useParams()
  const { data, isLoading } = useCreatorProfile(identityId)
  const username = useUsername(identityId)

  if (isLoading || data == null) return <Loading />
  const { stats } = data

  return (
    <div className='flex flex-col gap-10'>
      <header className='flex flex-wrap items-center gap-5'>
        <span className='size-20 overflow-hidden rounded-3xl bg-surface-2 p-2'><Avatar username={identityId} className='size-full' /></span>
        <div className='min-w-0'>
          <div className='text-small text-muted'>Pool creator</div>
          <h1 className='text-title'>{username ?? shortId(identityId, 8)}</h1>
          <div className='mt-1 flex items-center gap-1 font-mono text-tag text-muted'>
            <span className='break-all'>{identityId}</span>
            <CopyButton text={identityId} aria-label='Copy identity ID' />
          </div>
        </div>
        {stats.rating != null && (
          <div className='ml-auto flex items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-card'>
            <span className='text-[32px] leading-none font-extrabold tracking-[-0.03em]'>{stats.rating.toFixed(1)}</span>
            <div><Stars value={stats.rating} /><div className='text-tag text-muted'>{stats.ratingCount} review{stats.ratingCount === 1 ? '' : 's'}</div></div>
          </div>
        )}
      </header>

      <section className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        <Stat accent label='Masternodes formed' value={stats.formed} hint={`${stats.active} running now`} />
        <Stat label='Not valid now' value={stats.error} hint='PoSe-banned or revoked' />
        <Stat label='Signing' value={stats.signing} hint='Locked, not registered yet' />
        <Stat label='Time to lock' value={stats.avgLockHours == null ? '—' : stats.avgLockHours < 48 ? `${Math.round(stats.avgLockHours)} h` : `${Math.round(stats.avgLockHours / 24)} d`} hint='After joins reach 1000 DASH' />
      </section>
      <p className='-mt-6 text-tag text-muted'>
        Computed in your browser from Platform documents and the current masternode list. There is no uptime history yet.
      </p>

      <section>
        <SectionTitle>Pools</SectionTitle>
        {data.pools.length === 0
          ? <EmptyState title='No pools yet' />
          : (
            <ul className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {data.pools.map(s => (
                <li key={s.pool.id}>
                  <Link to={`/pools/${s.pool.id}`}>
                    <Card className='transition-colors hover:border-brand/50'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='truncate font-extrabold'>{s.pool.name}</div>
                          <div className='mt-1 text-small text-muted'>created {relativeTime(s.pool.createdAt)}</div>
                        </div>
                        <StatusBadge status={s.status} size='sm' />
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
            )}
      </section>

      <section>
        <SectionTitle>Member reviews</SectionTitle>
        {data.feedback.length === 0
          ? <p className='text-small text-muted'>No reviews yet. Only members of registered masternodes can review.</p>
          : (
            <ul className='flex flex-col gap-3'>
              {data.feedback.map(f => (
                <li key={f.id}>
                  <Card>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <IdentityChip id={f.ownerId} size='sm' />
                      <span className='flex items-center gap-2'><Stars value={f.rating} size={14} /><span className='text-tag text-muted'>{f.poolName} · {relativeTime(f.createdAt)}</span></span>
                    </div>
                    {f.text !== '' && <p className='mt-2 text-small'>{f.text}</p>}
                  </Card>
                </li>
              ))}
            </ul>
            )}
      </section>
    </div>
  )
}
