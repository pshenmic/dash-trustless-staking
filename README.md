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
http(s) rather than opening `index.html` from disk: Dash Platform Extension only injects into web pages.

## Data source: mock or testnet

Chosen under **Settings → Data source** (kept per browser); `VITE_BACKEND` in `.env` sets the default (`testnet`).

- **Mock sandbox**: Platform, DAPI and the transaction builder are simulated in the browser
  (`src/data/mock`), kept in `localStorage`. It starts with no pools; create one and play every role to try
  the whole flow, including registration.
  - **Settings → View as** lets you act as a made-up identity (alice, bob, carol … oscar).
  - Every signing step has **Fill with mock data** in place of a real wallet signature.
  - **Settings → Clear the sandbox** empties it again.
- **Testnet (live)**, the default: pools, joins and public chat are real documents of the contract in `VITE_CONTRACT_ID`
  (`src/data/live`), read through dash-platform-sdk and written through Dash Platform Extension. UTXO values
  and block height come from DAPI Core. Creating documents costs credits and is permanent.
  Locking, signing, registration and the private chat are switched off (`backend.features`) until Dash Core
  v24 activates on testnet and the extension has `decrypt`. The placeholder third-party operators are hidden.

Wallet connection is real in both modes.

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
  data/         source interfaces, view-model queries, mock backend
  wallet/       Dash Platform Extension connection
  hooks/        TanStack Query hooks
  components/   shared UI; pool/ holds the pool page parts
  pages/        routes
```

UI: [dash-ui-kit](https://github.com/AlexeyTripleA/dash-ui-kit) on Tailwind v4, with colors, type and
spacing from the Dash Brand Guidelines 2026 (`src/index.css`).
