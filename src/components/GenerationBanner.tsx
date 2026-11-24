import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { defaultGeneration } from '../contracts'
import { useGeneration } from '../generations'
import { Notice } from './ui'

/**
 * Shown on a generation that no longer accepts new pools or joins. It is not fully read-only — a pool
 * can still be locked, signed, registered or dissolved here — so the copy says exactly that.
 */
export function GenerationBanner ({ poolId }: { poolId?: string }): ReactNode {
  const { ref } = useGeneration()
  if (ref.canWrite) return null

  return (
    <Notice tone='warning' title={`You are viewing ${ref.label} — an earlier generation`}>
      <span>
        This contract no longer accepts new pools or joins. Pools that already exist here keep their
        original terms and can still be locked, signed, registered or dissolved.
      </span>
      <span className='mt-2 flex flex-wrap gap-x-4 gap-y-1 font-bold'>
        <Link to='/pools' className='text-brand-ink hover:underline'>Go to {defaultGeneration.label}</Link>
        {poolId != null && (
          <Link to={`/pools/new?from=${poolId}&gen=${ref.slug}`} className='text-brand-ink hover:underline'>
            Create this pool on {defaultGeneration.label}
          </Link>
        )}
      </span>
    </Notice>
  )
}