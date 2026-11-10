import { Button as KitButton, type ButtonProps } from 'dash-ui-kit/react'
import type { ReactNode } from 'react'
import { cn } from './ui'

/** dash-ui-kit Button without its forced Title Case: the brand guidelines use sentence case */
export function Button ({ className, ...props }: ButtonProps): ReactNode {
  return <KitButton {...props} className={cn('normal-case', className)} />
}
