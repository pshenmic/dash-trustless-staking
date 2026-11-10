import { DashLogo, useTheme } from 'dash-ui-kit/react'
import { Button } from './Button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { backend } from '../data'
import { useUsername } from '../hooks/data'
import { shortId } from '../lib/format'
import { useSettings } from '../lib/settings'
import { useWallet } from '../wallet/WalletContext'
import { IdentityChip } from './bits'
import { LoginDialog } from './LoginDialog'
import { errorMessage, useToast } from './Toast'
import { cn } from './ui'

const NAV = [
  { to: '/pools', label: 'Pools', icon: PoolsIcon },
  { to: '/pools/new', label: 'Create', icon: PlusIcon },
  { to: '/me', label: 'My dashboard', short: 'Me', icon: UserIcon },
  { to: '/guide', label: 'Guide', icon: BookIcon }
]

export function AppShell (): ReactNode {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  return (
    <div className='flex min-h-dvh flex-col'>
      <Banners />
      <Header />
      <main className='mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16'>
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      <LoginDialog />
    </div>
  )
}

function Banners (): ReactNode {
  const { previewIdentity, setPreviewIdentity } = useWallet()
  const previewName = useUsername(previewIdentity ?? '')
  return (
    <>
      {backend.mode === 'live' && (
        <div className='bg-midnight px-4 py-2 text-center text-tag text-white/85'>
          Testnet: pools, joins and locks are real Platform documents.{' '}
          <Link to='/settings' className='font-bold text-mint underline-offset-2 hover:underline'>Settings</Link>
        </div>
      )}
      {backend.mode === 'mock' && (
        <div className='bg-midnight px-4 py-2 text-center text-tag text-white/85'>
          Mock sandbox: nothing here is real or sent to the network.{' '}
          <Link to='/settings' className='font-bold text-mint underline-offset-2 hover:underline'>Settings</Link>
        </div>
      )}
      {previewIdentity != null && (
        <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-orange-soft px-4 py-2 text-center text-small'>
          <span>Viewing as <strong>{previewName ?? shortId(previewIdentity, 6)}</strong> (mock identity)</span>
          <button type='button' className='font-bold text-orange-ink underline' onClick={() => setPreviewIdentity(null)}>Stop</button>
        </div>
      )}
    </>
  )
}

function Header (): ReactNode {
  const { settings } = useSettings()
  return (
    <header className='sticky top-0 z-40 border-b border-line/60 bg-bg/85 backdrop-blur-md'>
      <div className='mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-8'>
        <Link to='/' className='flex shrink-0 items-center gap-2.5' aria-label='Dash Trustless Staking home'>
          <DashLogo size={22} color='var(--brand)' />
          <span className='hidden text-[15px] leading-4 font-extrabold tracking-[-0.02em] sm:block'>
            Trustless<br /><span className='text-brand-ink'>Staking</span>
          </span>
        </Link>
        <nav className='hidden items-center gap-1 md:flex' aria-label='Main'>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => cn(
                'rounded-full px-4 py-2 text-small font-semibold transition-colors',
                isActive ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:text-fg'
              )}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className='ml-auto flex items-center gap-2'>
          <span className='hidden rounded-full border border-line px-3 py-1 text-tag font-semibold text-muted capitalize sm:inline-block'>
            {settings.network}
          </span>
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  )
}

function ThemeToggle (): ReactNode {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      type='button'
      onClick={toggleTheme}
      className='flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg'
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function ConnectButton (): ReactNode {
  const { status, identity, identities, openLogin, logout, selectIdentity } = useWallet()
  const { notify } = useToast()

  if (identity != null) {
    const copy = (): void => {
      navigator.clipboard.writeText(identity)
        .then(() => notify('Identity ID copied', 'info'))
        .catch(e => notify(errorMessage(e), 'error'))
    }
    return (
      <Menu
        trigger={<IdentityChip id={identity} size='sm' />}
        items={[
          ...identities.filter(id => id !== identity).map(id => ({ label: `Use ${shortId(id, 6)}`, onClick: () => selectIdentity(id) })),
          { label: 'Copy identity ID', onClick: copy },
          { label: 'My dashboard', to: '/me' },
          { label: 'Log out', onClick: logout }
        ]}
      />
    )
  }

  return (
    <Button
      size='sm'
      colorScheme='brand'
      disabled={status === 'connecting'}
      onClick={openLogin}
      className='whitespace-nowrap'
    >
      {status === 'connecting' ? 'Logging in…' : 'Log in'}
    </Button>
  )
}

interface MenuItem {
  label: string
  onClick?: () => void
  to?: string
}

function Menu ({ trigger, items }: { trigger: ReactNode, items: MenuItem[] }): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(ref.current?.contains(e.target as Node) ?? false)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const itemClass = 'block w-full rounded-xl px-3 py-2 text-left text-small font-semibold hover:bg-surface-2'
  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        aria-haspopup='menu'
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className='max-w-44 rounded-full border border-line bg-surface py-1 pr-3 pl-1 hover:border-brand/60'
      >
        {trigger}
      </button>
      {open && (
        <div role='menu' className='absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-line/60 bg-surface p-1.5 shadow-card'>
          {items.map(item => item.to != null
            ? <Link key={item.label} role='menuitem' to={item.to} className={itemClass} onClick={() => setOpen(false)}>{item.label}</Link>
            : <button key={item.label} role='menuitem' type='button' className={itemClass} onClick={() => { setOpen(false); item.onClick?.() }}>{item.label}</button>)}
        </div>
      )}
    </div>
  )
}

function Footer (): ReactNode {
  return (
    <footer className='hidden border-t border-line/60 md:block'>
      <div className='mx-auto flex max-w-6xl items-center justify-between gap-6 px-8 py-6 text-small text-muted'>
        <span>Trustless shared masternodes on Dash. Runs on DAPI only, no servers.</span>
        <nav className='flex gap-5' aria-label='Footer'>
          <Link to='/guide' className='hover:text-fg'>Guide</Link>
          <Link to='/chat' className='hover:text-fg'>Community chat</Link>
          <Link to='/settings' className='hover:text-fg'>Settings</Link>
          <a href='https://github.com/pshenmic/dash-trustless-staking' target='_blank' rel='noreferrer' className='hover:text-fg'>GitHub</a>
        </nav>
      </div>
    </footer>
  )
}

function BottomNav (): ReactNode {
  return (
    <nav
      aria-label='Main'
      className='fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden'
    >
      <div className='grid grid-cols-5'>
        {[...NAV, { to: '/settings', label: 'Settings', icon: GearIcon }].map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) => cn(
              'flex flex-col items-center gap-1 py-2.5 text-tag',
              isActive ? 'text-brand-ink' : 'text-muted'
            )}
          >
            <item.icon />
            {'short' in item ? item.short : item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// Icons: stroke style matching the Curaft set the brand guidelines use

function Icon ({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden>
      {children}
    </svg>
  )
}

function PoolsIcon (): ReactNode {
  return <Icon><rect x='3' y='4' width='18' height='7' rx='2.5' /><rect x='3' y='13' width='18' height='7' rx='2.5' /><path d='M7 7.5h.01M7 16.5h.01' /></Icon>
}
function PlusIcon (): ReactNode {
  return <Icon><circle cx='12' cy='12' r='9' /><path d='M12 8v8M8 12h8' /></Icon>
}
function UserIcon (): ReactNode {
  return <Icon><circle cx='12' cy='8' r='4' /><path d='M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6' /></Icon>
}
function BookIcon (): ReactNode {
  return <Icon><path d='M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z' /><path d='M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5' /></Icon>
}
function GearIcon (): ReactNode {
  return <Icon><circle cx='12' cy='12' r='3' /><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' /></Icon>
}
function SunIcon (): ReactNode {
  return <Icon><circle cx='12' cy='12' r='4' /><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' /></Icon>
}
function MoonIcon (): ReactNode {
  return <Icon><path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' /></Icon>
}
