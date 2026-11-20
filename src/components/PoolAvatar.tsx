import type { ReactNode } from 'react'
import { poolAvatarColor, poolInitial } from '../lib/avatar'
import { cn } from './ui'

/** Square in square: 32 at cards, 64 in the pool header, 96 where a hero needs it */
const SIZES = { sm: 'size-8', md: 'size-16', lg: 'size-24' } as const
const LETTER = { sm: 'text-lg', md: 'text-3xl', lg: 'text-5xl' } as const

/**
 * A pool's avatar. With an image (once the avatar document ships) it renders the image, pixelated when the
 * source is small enough to be pixel art; without one it renders the pool name's initial on a colour derived
 * from the name, so every pool looks intentional and stable across devices without storing any bytes.
 */
export function PoolAvatar ({ poolId, name = '', src, size = 'sm', className }: { poolId: string, name?: string, src?: string, size?: keyof typeof SIZES, className?: string }): ReactNode {
  const initial = poolInitial(name, '?')
  const { background, foreground } = poolAvatarColor(name.trim() === '' ? poolId : name)

  return (
    <span className={cn('shrink-0 overflow-hidden bg-surface-2', SIZES[size], className)}>
      {src != null
        ? <AvatarImage src={src} />
        : (
          <span
            className={cn('flex size-full items-center justify-center font-extrabold select-none', LETTER[size])}
            style={{ background, color: foreground }}
            aria-hidden
          >
            {initial}
          </span>
          )}
    </span>
  )
}

/** Image with nearest-neighbour scaling for 32/64 px pixel art, smooth scaling for anything larger */
function AvatarImage ({ src }: { src: string }): ReactNode {
  return (
    <img
      src={src}
      alt=''
      onLoad={e => {
        const image = e.currentTarget
        image.style.imageRendering = image.naturalWidth > 0 && image.naturalWidth <= 64 ? 'pixelated' : 'auto'
      }}
      className='size-full object-cover'
    />
  )
}