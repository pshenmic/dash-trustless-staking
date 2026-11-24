import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from './components/AppShell'
import { GenerationRoute } from './generations'
import { ChatPage } from './pages/ChatPage'
import { CreatePoolPage } from './pages/CreatePoolPage'
import { CreatorPage } from './pages/CreatorPage'
import { GuidePage } from './pages/GuidePage'
import { GovernancePage } from './pages/GovernancePage'
import { HomePage } from './pages/HomePage'
import { MePage } from './pages/MePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PoolPage } from './pages/PoolPage'
import { PoolsPage } from './pages/PoolsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

/*
 * Hash routing: the static build works from any host or a local folder, with no server rewrites.
 * Unprefixed routes are the default (latest) generation; `/:slug/...` addresses an older one, whose
 * pools stay readable and completable but take no new joins.
 */
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/pools', element: <GenerationRoute><PoolsPage /></GenerationRoute> },
      { path: '/pools/new', element: <CreatePoolPage /> },
      { path: '/pools/:poolId', element: <GenerationRoute><PoolPage /></GenerationRoute> },
      { path: '/:slug/pools', element: <GenerationRoute><PoolsPage /></GenerationRoute> },
      { path: '/:slug/pools/:poolId', element: <GenerationRoute><PoolPage /></GenerationRoute> },
      { path: '/profile', element: <MePage /> },
      // The dashboard was called /me before it became the profile page; old links keep working
      { path: '/me', element: <Navigate to='/profile' replace /> },
      { path: '/creators/:identityId', element: <CreatorPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/governance', element: <GovernancePage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/guide', element: <GuidePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])
