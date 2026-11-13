import type { ReactNode } from 'react'
import { poolTile } from '../lib/presentation'

/** A pool has no image: its tile is a gradient derived from the id, with initials from the name */
export function PoolTile ({ name, id, size = 48 }: { name: string, id: string, size?: number }): ReactNode {
  const tile = poolTile(name, id)
  return (
    <span
      aria-hidden
      className='flex shrink-0 items-center justify-center rounded-[14px] font-extrabold text-white'
      style={{ width: size, height: size, background: tile.background, fontSize: Math.round(size * 0.34) }}
    >
      {tile.initials}
    </span>
  )
}