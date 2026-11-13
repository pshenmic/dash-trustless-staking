# Dash Trustless Staking: web app

A static React app that coordinates **Dash Core v24 shared masternodes**: members pool DASH into one
1000 DASH masternode, coordinating through Dash Platform documents. It runs against DAPI only, with no
servers, so anyone can build it and run it locally. See [`DESIGN.md`](DESIGN.md) for the protocol
and data contract.

## Run

```bash
yarn install
yarn dev           # http://localhost:5173
yarn build         # static build in dist/
yarn preview       # serve dist/ over http
```

The build uses relative paths and hash routing, so `dist/` works from any static host. Serve it over
http(s) rather than opening `index.html` from disk.

The Platform SDK's WASM uses `SharedArrayBuffer`, so the page must be cross-origin isolated. Vite's dev
and preview servers send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The production host must send the same two headers (for nginx, `add_header Cross-Origin-Opener-Policy
same-origin always;` and `add_header Cross-Origin-Embedder-Policy require-corp always;`). Without them the
dashboard fails with `SharedArrayBuffer transfer requires self.crossOriginIsolated`.

## Data source: mock or testnet

Chosen under **Settings → Data source** (kept per browser); `VITE_BACKEND` in `.env` sets the default (`testnet`).

- **Mock sandbox**: Platform, DAPI and the transaction builder are simulated in the browser
  (`src/data/mock`), kept in `localStorage`. It starts with no pools; create one and play every role to try
  the whole flow, including registration.
  - **Settings → View as** lets you act as a made-up identity (alice, bob, carol … oscar).
  - Every signing step has **Fill with mock data** in place of a real wallet signature.
  - **Settings → Clear the sandbox** empties it again.
- **Testnet (live)**, the default: pools, joins, chat, locking, signing and registration are real documents of
  the contract in `VITE_CONTRACT_ID` (`src/data/live`), read through dash-platform-sdk and signed by the logged-in
  identity (private keys or the extension). UTXO values and block height come from DAPI Core. Creating documents
  costs credits and is permanent.

**Login** offers **Dash Platform Extension** (preferred; install and unlock it in Chrome) or two keys of the
same Dash Platform identity on testnet: the **authentication key** (signs your actions) and the **encryption
key** (opens the private chat). Private-key sessions are kept in session storage: a reload keeps you logged in,
and closing the browser logs you out. The mock sandbox keeps its made-up identities and never uses these keys.

## Testnet contract and scripts

The data contract (`schema.json`) is deployed on testnet; its ID is `VITE_CONTRACT_ID` in `.env`.

Scripts in `scripts/` talk to testnet with the identity in `.env.local` (git-ignored; copy the two
`PLATFORM_IDENTITY_*` variables there):

```bash
yarn identity        # balance and keys of the test identity (read-only)
yarn test:contract   # creates test documents and checks the contract's rules and queries
yarn test:live       # creates a pool and a join through the app's live data layer and reads them back
yarn deploy:contract # deploys schema.json as a NEW contract (about 0.42 DASH)
```

## Layout

```
src/
  lib/          consensus constants, validation rules, money math, status derivation (pure)
  data/         source interfaces, view-model queries, live and mock backends
  wallet/       login session, identity lookup and Platform signing
  hooks/        TanStack Query hooks
  components/   shared UI; pool/ holds the pool page parts
  pages/        routes
```

UI: [dash-ui-kit](https://github.com/AlexeyTripleA/dash-ui-kit) on Tailwind v4, with colors, type and
spacing from the Dash Brand Guidelines 2026 (`src/index.css`).
