import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { OperatorKeyUsage } from '../../data/queries'
import { shortId } from '../../lib/format'
import { Notice } from '../ui'

/**
 * Operator key conflicts before registration. A key held by a masternode makes the registration
 * fail (bad-protx-dup-key); a key shared with other pools means only one of them can ever register.
 */
export function OperatorKeyNotice ({ usage, creating = false }: { usage: OperatorKeyUsage, creating?: boolean }): ReactNode {
  if (usage.masternode != null) {
    return (
      <Notice tone='error' title='Operator key already in use'>
        Masternode <span className='font-mono'>{shortId(usage.masternode.proTxHash, 8)}</span> already uses this
        operator key, so {creating ? 'a pool using it can never register. Generate a new key for this pool.' : 'the network will reject this pool’s registration. It can never form.'}
      </Notice>
    )
  }
  if (usage.otherPools.length === 0) return null
  return (
    <Notice tone='warning' title={`Operator key shared with ${usage.otherPools.length === 1 ? 'another pool' : `${usage.otherPools.length} other pools`}`}>
      Only one pool can register a masternode with this key; the others will fail at broadcast.{' '}
      {usage.otherPools.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <Link to={`/pools/${p.id}`} className='font-bold text-brand-ink hover:underline'>{p.name}</Link>
        </span>
      ))}
    </Notice>
  )
}
