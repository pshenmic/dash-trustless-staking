import { Dialog } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'

/**
 * A large sheet built on the kit's Radix dialog: centred on desktop, full-screen on mobile, with the
 * grid still mounted behind. The kit's own header is hidden (the title stays in the DOM for the
 * dialog's accessible name) because the pool sheet draws its own header.
 */
export function Sheet ({ open, onOpenChange, title, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}): ReactNode {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showCloseButton={false}
      maxWidth='1120px'
      className='max-h-[92dvh] !gap-0 !overflow-hidden !rounded-3xl !border-0 !bg-surface !p-0 !outline-none shadow-card [&>div:first-child]:hidden max-md:!top-0 max-md:!h-dvh max-md:!max-h-dvh max-md:!w-full max-md:!translate-y-0 max-md:!rounded-none dark:!bg-surface'
    >
      {children}
    </Dialog>
  )
}