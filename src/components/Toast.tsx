import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from './ui'

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider ({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId++
    setToasts(list => [...list, { id, tone, message }])
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), tone === 'error' ? 8000 : 4500)
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live='polite'
        className='pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6'
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-2xl px-4 py-3 text-small font-semibold shadow-card',
              t.tone === 'success' && 'bg-mint text-midnight',
              t.tone === 'error' && 'bg-red text-white',
              t.tone === 'info' && 'bg-midnight text-white dark:bg-surface-2'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast (): ToastContextValue {
  const context = useContext(ToastContext)
  if (context == null) throw new Error('useToast must be used inside ToastProvider')
  return context
}

export function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
