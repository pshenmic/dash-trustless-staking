import { createHashRouter } from 'react-router'
import { AppShell } from './components/AppShell'
import { ChatPage } from './pages/ChatPage'
import { CreatePoolPage } from './pages/CreatePoolPage'
import { CreatorPage } from './pages/CreatorPage'
import { GuidePage } from './pages/GuidePage'
import { HomePage } from './pages/HomePage'
import { MePage } from './pages/MePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PoolPage } from './pages/PoolPage'
import { PoolsPage } from './pages/PoolsPage'
import { SettingsPage } from './pages/SettingsPage'

// Hash routing: the static build works from any host or a local folder, with no server rewrites
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/pools', element: <PoolsPage /> },
      { path: '/pools/new', element: <CreatePoolPage /> },
      { path: '/pools/:poolId', element: <PoolPage /> },
      { path: '/me', element: <MePage /> },
      { path: '/creators/:identityId', element: <CreatorPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/guide', element: <GuidePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])
