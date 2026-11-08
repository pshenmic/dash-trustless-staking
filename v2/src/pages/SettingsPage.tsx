import { Select, Textarea, useTheme } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { IdentityChip } from '../components/bits'
import { useToast } from '../components/Toast'
import { Card, Chip, Field, Notice, PageHeader, SectionTitle } from '../components/ui'
import { backend, backendMode, setBackendMode } from '../data'
import { mockUsernames, resetMockState } from '../data/mock/mockBackend'
import { useSettings } from '../lib/settings'
import type { Network } from '../lib/types'
import { useWallet } from '../wallet/WalletContext'

export function SettingsPage (): ReactNode {
  const { settings, update, toggleBan } = useSettings()
  const { theme, setTheme } = useTheme()
  const { previewIdentity, setPreviewIdentity } = useWallet()
  const { notify } = useToast()
  const client = useQueryClient()
  const [endpoints, setEndpoints] = useState(settings.dapiEndpoints.join('\n'))

  const saveEndpoints = (): void => {
    update({ dapiEndpoints: endpoints.split(/\s+/).map(e => e.trim()).filter(e => e !== '') })
    notify('DAPI endpoints saved')
  }

  return (
    <div className='mx-auto flex max-w-2xl flex-col gap-8'>
      <PageHeader title='Settings' subtitle='Stored in this browser only.' />

      <Card className='flex flex-col gap-5'>
        <SectionTitle>Data source</SectionTitle>
        <Field
          label='Where pools come from'
          hint={backendMode() === 'testnet'
            ? 'Real documents on Dash Platform testnet. Creating a pool, joining or locking costs credits and is permanent.'
            : 'An empty sandbox simulated in this browser, for trying the whole flow including registration. Nothing is sent to the network.'}
        >
          <div className='flex gap-2'>
            <Chip active={backendMode() === 'testnet'} onClick={() => setBackendMode('testnet')}>Testnet (live)</Chip>
            <Chip active={backendMode() === 'mock'} onClick={() => setBackendMode('mock')}>Mock sandbox</Chip>
          </div>
        </Field>
      </Card>

      <Card className='flex flex-col gap-5'>
        <SectionTitle>Network</SectionTitle>
        {backend.mode === 'mock' && (
          <Field label='Dash network'>
            <div className='flex gap-2'>
              {(['testnet', 'mainnet'] as Network[]).map(n => (
                <Chip key={n} active={settings.network === n} onClick={() => update({ network: n })}>{n === 'testnet' ? 'Testnet' : 'Mainnet'}</Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label='DAPI endpoints' optional hint='One host:port per line. Leave empty to use the network’s default nodes. Applies after a reload.' htmlFor='dapi'>
          <Textarea id='dapi' rows={3} showPasteButton={false} font='grotesque' value={endpoints} onChange={setEndpoints} placeholder='seed-1.testnet.networks.dash.org:1443' />
        </Field>
        <div><Button size='sm' colorScheme='lightBlue' onClick={saveEndpoints}>Save endpoints</Button></div>
      </Card>

      <Card className='flex flex-col gap-5'>
        <SectionTitle>Appearance</SectionTitle>
        <Field label='Theme'>
          <Select
            value={theme}
            onChange={v => setTheme(v as 'light' | 'dark')}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            className='max-w-48'
          />
        </Field>
      </Card>

      <Card className='flex flex-col gap-4'>
        <SectionTitle>Ban list</SectionTitle>
        <p className='text-small text-muted'>Members you don’t want in your pools, for example after they spent committed coins. They are marked when you select members.</p>
        {settings.banList.length === 0
          ? <p className='text-small text-muted'>Nobody is banned.</p>
          : (
            <ul className='divide-y divide-line/70'>
              {settings.banList.map(id => (
                <li key={id} className='flex items-center justify-between gap-3 py-2.5'>
                  <IdentityChip id={id} size='sm' />
                  <button type='button' className='text-small font-bold text-brand-ink hover:underline' onClick={() => toggleBan(id)}>Unban</button>
                </li>
              ))}
            </ul>
            )}
      </Card>

      {backend.mode === 'mock' && (
        <Card className='flex flex-col gap-5'>
          <SectionTitle>Mock sandbox</SectionTitle>
          <Notice tone='info'>
            The sandbox starts with no pools. Create one, then use View as to join it as other identities, lock it
            and sign with mock signatures. Everything stays in this browser.
          </Notice>
          <Field label='View as' hint='Act as one of the made-up identities, to play the creator and each member yourself.'>
            <Select
              value={previewIdentity ?? ''}
              onChange={v => setPreviewIdentity(v === '' ? null : v)}
              placeholder='Your connected identity'
              options={[
                { value: '', label: 'Your connected identity' },
                ...Object.entries(mockUsernames()).map(([id, name]) => ({ value: id, label: name }))
              ]}
              className='max-w-72'
            />
          </Field>
          <div>
            <Button
              size='sm'
              colorScheme='red'
              variant='outline'
              onClick={() => {
                resetMockState()
                void client.invalidateQueries()
                notify('Sandbox cleared', 'info')
              }}
            >
              Clear the sandbox
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
