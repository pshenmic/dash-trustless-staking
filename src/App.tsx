import { createHashRouter } from 'react-router'
import { AppShell } from './components/AppShell'
import { ChatPage } from './pages/ChatPage'
import { CreatePoolPage } from './pages/CreatePoolPage'
import { CreatorPage } from './pages/CreatorPage'
import { GuidePage } from './pages/GuidePage'
import { MePage } from './pages/MePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PoolSheet } from './pages/PoolSheet'
import { PoolsLayout } from './pages/PoolsLayout'
import { PoolsPage } from './pages/PoolsPage'
import { SettingsPage } from './pages/SettingsPage'

// Hash routing: the static build works from any host or a local folder, with no server rewrites
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <PoolsPage /> },
      { path: '/pools', element: <PoolsLayout />, children: [{ index: true }, { path: ':poolId', element: <PoolSheet /> }] },
      { path: '/pools/new', element: <CreatePoolPage /> },
      { path: '/me', element: <MePage /> },
      { path: '/creators/:identityId', element: <CreatorPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/guide', element: <GuidePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])
