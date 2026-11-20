import { useState, type ReactNode } from 'react'
import { readAvatar } from '../../lib/image'
import { PoolAvatar } from '../PoolAvatar'
import { useToast } from '../Toast'

/**
 * Owner-only avatar control: the avatar is static until hovered, then darkens and offers Upload. Only
 * exact 32×32 or 64×64 images are accepted — the file is validated, re-encoded to PNG and handed back
 * through `onSet`; anything else is rejected with the reason, never cropped or scaled.
 */
export function AvatarUpload ({ poolId, name, src, onSet, onRemove }: {
  poolId: string
  name: string
  src?: string
  onSet: (dataUrl: string) => void
  onRemove: () => void
}): ReactNode {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <label className='group relative block shrink-0 cursor-pointer overflow-hidden' title='Upload a 32×32 or 64×64 avatar'>
      <PoolAvatar poolId={poolId} name={name} src={src} size='md' />
      <span className='absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'>
        <span className='text-tag font-bold'>{busy ? 'Reading…' : 'Upload'}</span>
        {src != null && (
          <button
            type='button'
            className='mt-0.5 text-[10px] underline'
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }}
          >
            Remove
          </button>
          )}
      </span>
      <input
        type='file'
        accept='image/png,image/webp,image/jpeg'
        className='hidden'
        aria-label='Upload pool avatar'
        onChange={async e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file == null) return
          setBusy(true)
          const result = await readAvatar(file)
          setBusy(false)
          if (result.ok) onSet(result.dataUrl)
          else notify(result.reason, 'error')
        }}
      />
    </label>
  )
}