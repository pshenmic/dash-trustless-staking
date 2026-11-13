/*
 * Dash Platform Extension bridge. The extension injects `window.dashPlatformExtension` into every
 * http(s) page at document_start; after a successful connect() it also injects
 * `window.dashPlatformSDK`. See dash-platform-extension/README.md.
 */

export interface WalletInfo {
  currentIdentity: string
  identities: string[]
}

/**
 * Request for the planned `decrypt` method (not in the extension yet). The private chat uses it to
 * open a member's envelope of the group key (DESIGN.md "Private chat"): ECIES over secp256k1.
 * The extension does ECDH between the identity key `keyId` and `ephemeralPublicKey`, derives the AES key,
 * and returns the plaintext. The private key never leaves the extension.
 */
export interface DecryptRequest {
  identity: string
  /** ID of the identity public key the data was encrypted to */
  keyId: number
  /** Sender's throwaway public key, 33 bytes compressed */
  ephemeralPublicKey: Uint8Array
  /** AES-256-GCM nonce, 12 bytes */
  nonce: Uint8Array
  /** Ciphertext followed by the 16-byte tag */
  ciphertext: Uint8Array
}

/**
 * What the extension's connect() resolves with. Older builds list identities as plain IDs; 1.5 lists
 * objects. `currentIdentity` is null when the wallet has identities but none is marked as current.
 */
interface RawWalletInfo {
  currentIdentity: string | null
  identities: Array<string | { identifier: string }>
}

interface ExtensionSigner {
  connect: () => Promise<RawWalletInfo>
  signAndBroadcast: (stateTransition: unknown) => Promise<unknown>
  /** Planned. Resolves with the plaintext, or rejects when the key can't open the data or the user declines. */
  decrypt?: (request: DecryptRequest) => Promise<Uint8Array>
}

declare global {
  interface Window {
    dashPlatformExtension?: { signer: ExtensionSigner }
  }
}

export function getExtension (): ExtensionSigner | null {
  return window.dashPlatformExtension?.signer ?? null
}

/**
 * Calls back once the extension's bridge is on the page. The extension adds it late: after its storage
 * migrations and WASM load, well after the app has started. So this never gives up: it listens for the
 * extension's "content-script-ready" message and polls as a fallback (for an extension enabled or
 * installed while the page is open). Returns a function that stops watching.
 */
export function watchForExtension (onFound: (signer: ExtensionSigner) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined

  const check = (): void => {
    const signer = getExtension()
    if (stopped || signer == null) return
    stop()
    onFound(signer)
  }
  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { context?: string, method?: string } | null
    // The bridge script is injected just before this message; give it a moment to run
    if (data?.context === 'dash-platform-extension' && data.method === 'content-script-ready') setTimeout(check, 50)
  }
  const stop = (): void => {
    stopped = true
    window.removeEventListener('message', onMessage)
    if (timer != null) clearInterval(timer)
  }

  window.addEventListener('message', onMessage)
  timer = setInterval(check, 500)
  check()
  return stop
}

export async function connectExtension (): Promise<WalletInfo> {
  const signer = getExtension()
  if (signer == null) throw new Error('Dash Platform Extension is not installed')
  let info: RawWalletInfo
  try {
    info = await signer.connect()
  } catch (e) {
    // The extension rejects with plain strings, not Error objects
    throw e instanceof Error ? e : new Error(String(e))
  }
  const identities = (info.identities ?? []).map(i => typeof i === 'string' ? i : i.identifier)
  // Any identity in the wallet can sign; the extension asks which one when it approves a transaction
  const currentIdentity = info.currentIdentity ?? identities[0] ?? null
  if (currentIdentity == null) {
    throw new Error('The extension’s wallet has no identity yet. Create or import one in the extension, then connect again.')
  }
  return { currentIdentity, identities }
}
