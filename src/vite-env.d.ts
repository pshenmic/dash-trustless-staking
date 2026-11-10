/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Registration transaction fee for new pools, in DASH (default 0.0002) */
  readonly VITE_REGISTRATION_FEE?: string
  /** Testnet data contract ID (schema.json) */
  readonly VITE_CONTRACT_ID?: string
  /** Default backend: 'mock' or 'testnet'. Settings can override it per browser. */
  readonly VITE_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
