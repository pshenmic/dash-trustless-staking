import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'dash-ui-kit/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './App'
import { ToastProvider } from './components/Toast'
import { SettingsProvider } from './lib/settings'
import { WalletProvider } from './wallet/WalletContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true }
  }
})

function initialTheme (): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage unavailable: follow the system
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider initialTheme={initialTheme()}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <WalletProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </WalletProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
