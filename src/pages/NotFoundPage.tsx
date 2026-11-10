import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/ui'

export function NotFoundPage (): ReactNode {
  return (
    <EmptyState title='Page not found' action={<Link to='/' className='font-bold text-brand-ink'>Go home</Link>}>
      This address doesn’t match any page.
    </EmptyState>
  )
}
