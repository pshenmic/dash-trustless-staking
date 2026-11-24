import { Dialog, Input } from 'dash-ui-kit/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useWallet } from '../wallet/WalletContext'
import { Button } from './Button'
import { errorMessage, useToast } from './Toast'
import { Field, Notice } from './ui'

/**
 * Login dialog. Dash Platform Extension is the preferred method; private-key login needs only the
 * authentication key — the encryption key existed for private chat, which is no longer in the app.
 */
export function LoginDialog (): ReactNode {
  const { loginOpen, closeLogin, loginWithPrivateKey, loginWithExtension } = useWallet()
  const { notify } = useToast()
  const [authenticationKey, setAuthenticationKey] = useState('')
  const [showPrivate, setShowPrivate] = useState(false)
  const [pending, setPending] = useState<'private' | 'extension' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loginOpen) return
    setAuthenticationKey('')
    setShowPrivate(false)
    setError(null)
    setPending(null)
  }, [loginOpen])

  const submit = async (): Promise<void> => {
    setPending('private')
    setError(null)
    try {
      await loginWithPrivateKey(authenticationKey)
      notify('Logged in', 'success')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const submitExtension = async (): Promise<void> => {
    setPending('extension')
    setError(null)
    try {
      await loginWithExtension()
      notify('Logged in with Dash Platform Extension', 'success')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog
      open={loginOpen}
      onOpenChange={open => { if (!open) closeLogin() }}
      title='Log in'
      maxWidth='md'
      horizontalMargin={12}
      className='max-h-[92dvh] overflow-y-auto !rounded-3xl dark:!border-line dark:!bg-surface'
    >
      <div className='flex flex-col gap-2'>
        <Button
          size='sm'
          colorScheme='brand'
          className='w-full justify-center'
          disabled={pending != null}
          onClick={() => { void submitExtension() }}
        >
          {pending === 'extension' ? 'Connecting…' : 'Login with Dash Extension'}
        </Button>

        <Button
          size='sm'
          colorScheme='lightBlue'
          className='w-full justify-center'
          disabled={pending != null}
          onClick={() => setShowPrivate(value => !value)}
        >
          {showPrivate ? 'Hide Private Key' : 'Login with Private Key'}
        </Button>

        {showPrivate && (
          <div className='flex flex-col gap-3 rounded-2xl border border-line p-3'>
            <Field
              label='Authentication key'
              hint='AUTHENTICATION key with HIGH or CRITICAL security.'
              htmlFor='login-authentication-key'
            >
              <Input
                id='login-authentication-key'
                type='password'
                autoComplete='off'
                spellCheck={false}
                value={authenticationKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthenticationKey(e.target.value)}
                placeholder='WIF or 64-character hex'
              />
            </Field>

            <p className='text-tag text-muted'>
              Signs your actions on testnet. Kept for this browser session only.
            </p>

            <Button
              colorScheme='brand'
              size='sm'
              className='self-start'
              disabled={pending != null || authenticationKey.trim() === ''}
              onClick={() => { void submit() }}
            >
              {pending === 'private' ? 'Looking up identity…' : 'Log in'}
            </Button>
          </div>
        )}

        {error != null && <Notice tone='error' title='Could not log in'>{error}</Notice>}
      </div>
    </Dialog>
  )
}