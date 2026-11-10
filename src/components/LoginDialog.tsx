import { Dialog, Input } from 'dash-ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useWallet } from '../wallet/WalletContext'
import { Button } from './Button'
import { errorMessage, useToast } from './Toast'
import { Field, Notice } from './ui'

/**
 * Login dialog. The extension option is the preferred one but stays disabled until its next release;
 * private-key login needs both the authentication key (signing) and the encryption key (private chat)
 * of the same Dash Platform identity.
 */
export function LoginDialog (): ReactNode {
  const { loginOpen, closeLogin, loginWithPrivateKey } = useWallet()
  const { notify } = useToast()
  const [authenticationKey, setAuthenticationKey] = useState('')
  const [encryptionKey, setEncryptionKey] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loginOpen) return
    setAuthenticationKey('')
    setEncryptionKey('')
    setError(null)
    setPending(false)
  }, [loginOpen])

  const submit = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await loginWithPrivateKey(authenticationKey, encryptionKey)
      notify('Logged in', 'success')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={loginOpen}
      onOpenChange={open => { if (!open) closeLogin() }}
      title='Log in'
      maxWidth='lg'
      horizontalMargin={12}
      className='max-h-[92dvh] overflow-y-auto !rounded-3xl dark:!border-line dark:!bg-surface'
    >
      <div className='flex flex-col gap-5'>
        <p className='text-small text-muted'>Choose how to sign in.</p>

        <div className='flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2 p-4 opacity-60'>
          <div className='flex flex-col gap-1'>
            <span className='font-bold'>Dash Extension</span>
            <span className='text-small text-muted'>Preferred. Available after the next extension release.</span>
          </div>
          <Button size='sm' colorScheme='lightBlue' disabled>Unavailable</Button>
        </div>

        <div className='flex flex-col gap-4 rounded-2xl border border-line p-4'>
          <div className='flex flex-col gap-1'>
            <span className='font-bold'>Private Key</span>
            <span className='text-small text-muted'>
              Both keys must belong to the same Dash Platform identity on testnet. They are stored in this
              browser so you can sign and read your messages.
            </span>
          </div>

          <Field
            label='Authentication key'
            hint='Signs your actions. An AUTHENTICATION key with HIGH or CRITICAL security.'
            htmlFor='login-authentication-key'
          >
            <Input
              id='login-authentication-key'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={authenticationKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthenticationKey(e.target.value)}
              placeholder='WIF or 64-character hex private key'
            />
          </Field>

          <Field
            label='Encryption key'
            hint='Reads your private messages. An ENCRYPTION or DECRYPTION key of the same identity.'
            htmlFor='login-encryption-key'
          >
            <Input
              id='login-encryption-key'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={encryptionKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncryptionKey(e.target.value)}
              placeholder='WIF or 64-character hex private key'
            />
          </Field>

          {error != null && <Notice tone='error' title='Could not log in'>{error}</Notice>}

          <div className='flex justify-end'>
            <Button
              colorScheme='brand'
              size='md'
              disabled={pending || authenticationKey.trim() === '' || encryptionKey.trim() === ''}
              onClick={() => { void submit() }}
            >
              {pending ? 'Looking up identity…' : 'Log in'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}