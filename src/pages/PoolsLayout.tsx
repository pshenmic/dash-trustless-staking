import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { PoolsPage } from './PoolsPage'

/** The grid stays mounted behind the pool sheet, so closing a pool returns to the same filtered list */
export function PoolsLayout (): ReactNode {
  return (
    <>
      <PoolsPage />
      <Outlet />
    </>
  )
}