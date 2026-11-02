# Real ProRegTx signing and testnet testing — design

2026-11-02. Supersedes the mock `TxBuilder` and hand-rolled `dapiCore.ts` in `v2/`.
Protocol reference: `DESIGN.md` §6, §7, §9, §10. Consensus and RPC reference: Dash Core `v24.0.x` —
`src/evo/providertx.cpp` (`MakeSharedRegConsentHash`, `CProDisTx::MakeSignHash`), `src/rpc/evo.cpp`
(`protx shared_*`), `src/evo/core_write.cpp` (`protx diff` JSON).

## Intent and why

The v2 dapp already publishes every Platform document and derives pool state, but every transaction-level
piece is a shape-fake: `mockTxBuilder` invents hex, consent hashes and signatures, and the live
`ChainSource` stubs the masternode list and `broadcastTransaction`. Now that v24 is live on testnet, the
app should build the **real** shared ProRegTx on the page, let each member sign it in their own wallet
(Dash Core as the reference), and publish/broadcast what comes back — so a pool can actually register.

The point is not "call an SDK". It is that a member's consent is only worth anything if the digest they
signed is the digest Core recomputes when it validates `vchJoinSigs`. Everything here exists to make that
true byte-for-byte, and to prove it against Core before spending testnet DASH.

## Goals

1. `v2/` builds a real, deterministic **funding transaction** and a real shared ProRegTx (v3 payload,
   `shares`, `joinSigs`, `ExtNetInfo`, early period/penalty) from `pool` + `lock` + `join` documents, and
   shows the hex, the consent hash, and the exact Core command that reproduces them.
2. The app verifies what the user pastes back before publishing anything: consent signatures recover to
   the share's owner key; funding scriptSigs satisfy SIGHASH_ALL for that member's inputs on the
   join-signed tx; a pasted ProDisTx is a well-formed unilateral dissolve signed by the actor's key.
3. Live `ChainSource` uses `dash-core-sdk` for `getTransaction`, `broadcastTransaction`, best height and
   the simplified masternode list, so `derivePoolStatus` can return FORMED / ERROR / DISSOLVED for real.
4. The consent and dissolve digests live in `dash-core-sdk`, tested byte-for-byte against Dash Core v24.
5. A pool registers on testnet end to end, driven from the UI, with Dash Core as the signer.

## Non-goals

- No keys, seeds or signing in the browser. Copy-paste only (DESIGN §10), including for funding inputs.
- No `sharedmn-*` protocol in Dash Platform Extension or Dash Desktop Wallet. The wallet reuses the SDK
  functions this design adds, later.
- No EvoNode (`shared_register_prepare_evo`) support; regular masternodes only.
- No private-chat work. `features.privateChat` stays `false`; `mockChatCrypto` stays.
- No unanimous (n-of-n) dissolve UI; the app also does not build a ProDisTx — the wallet does.
- No v1 CLI changes, no contract changes, no UI redesign.

## Anti-goals (this failed even if it "works")

- A builder that produces hex Core rejects because one uint was serialized big-endian, or whose consent
  hash silently differs from Core's.
- Verifying signatures by trusting a claim in a Platform document instead of recovering the key.
- Broadcasting a tx whose scriptSigs were never verified against the prevout scripts.
- Reporting DISSOLVED for a pool that is simply newer than the masternode list we hold.

## Constraints

- Amounts are bigint duffs inside the SDK; `v2`'s domain model uses `number` duffs. Conversion happens at
  the adapter boundary and must not lose precision on the 1000 DASH collateral.
- Every client must build identical bytes from identical documents (DESIGN §6): inputs come from the
  `join` documents, never from wallet coin selection; no clock, no randomness, stable ordering.
- Core's `shared_register_prepare` consumes a **funding transaction** (all participants' inputs and change
  outputs) and appends the collateral output and payload. The funding tx is therefore the artifact our
  builder must reproduce exactly; the full regtx is Core's output and must match ours byte for byte.
- Core requires the share `ownerAddress` to be P2PKH, and a v3 ProRegTx operator key to be **basic-scheme
  BLS** (`ParseBLSPubKey(..., specific_legacy_bls_scheme = false)`).
- Dash's dust threshold follows `3000 duff/kB × (serialized output + 148)` = 546 duffs for a P2PKH output
  (DESIGN §6 says dust change is omitted). Pin it from `getnetworkinfo` when the node is available.
- The masternode list from DAPI is CBOR-encoded `protx diff` JSON, sent as a full diff on subscribe and as
  incremental diffs afterwards. It is a *chainlocked* view, so it can lag the tip.
- `v2/package.json` currently has no SDK dependency; the app builds with Vite and runs in the browser.

## Approaches

- **A. Protocol in the SDK, policy in the app — chosen.** `consentHash`, `dissolveSignHash` and compact
  sign/recover go upstream in `dash-core-sdk`; the deterministic builder, scriptSig verification and
  diff parsing stay in `v2/`. The digests are consensus surface that the dapp *and* Dash Desktop Wallet
  must reproduce bit-for-bit, so they belong where both can import them. The builder is driven by this
  project's Platform documents, so it belongs here. Cost: one SDK build/publish cycle.
- **B. Everything in `v2/`.** Fastest iteration, one repo. Rejected: the wallet will need identical
  digests, and a second implementation of a consensus hash is a latent consensus split.
- **C. Everything in the SDK, app thin.** Rejected: the builder would have to learn this app's document
  model, and every debugging round trip becomes build + publish.

## What goes in `dash-core-sdk`

Branch off `origin/master` (the local checkout is behind it with no local commits; npm has it as
`1.1.5-dev.1`). New modules, both re-exported from `index.ts`:

`src/consent.ts`
- `consentHash(tx: Transaction): string` — `CProRegTx::MakeSharedRegConsentHash`, DESIGN §7. Preconditions:
  `payload instanceof ProRegTX`, `version >= 3`, `shares.length > 0`, `joinSigs.length === shares.length`.
  Deliberately excludes scriptSigs and joinSigs.
- `dissolveSignHash(tx: Transaction, sigCount: number): string` — `CProDisTx::MakeSignHash`, DESIGN §7.
  Preconditions: `payload instanceof ProDisTx`, `1 <= sigCount <= 255`.

`src/compactSignature.ts`
- `signCompact(hash: string, privateKey: PrivateKey): string` — 65-byte hex: header `27 + recid (+4 when
  compressed)`, low-S `r`, `s`.
- `recoverCompact(hash: string, signature: string): PublicKey`
- `verifyCompact(hash: string, signature: string, keyId: string): boolean` — recovers, compares key ID.
- Add `PublicKey.getKeyID(): string` (hash160 hex); nothing exposes it today.

Both digests return double-SHA256 in display order (reversed), matching `Transaction.hash()`.

Tests in `tests/ConsentHash.test.ts`: Core-produced vectors (Stage 0), a round-trip test that re-serializes
Core's hex to identical bytes, and negative tests (tampered share amount, swapped owner key, changed
`nSequence` → different hash).

## What goes in `v2/`

**`src/lib/registration.ts`** — pure builder, no I/O:
- `buildRegistration(pool, members, inputValues)` → `{ fundingHex, tx, unsignedHex, consentHash,
  collateralIndex, members: RegistrationMember[], problems }`. Funding tx: version 3, inputs in
  `lock.joinIds` order with `nSequence = 0xffffffff`, per-member change outputs to `changeAddress`
  (dust change omitted). Full regtx: funding tx + 1000 DASH to `04445348437551` + v3 ProRegTX payload,
  consent hash from the SDK.
- `withJoinSignatures(tx, signatures)` — inserts 65-byte sigs in share order.
- `extractScriptSigs(joinedHex, member)` / `verifyScriptSigs(joinedHex, member, scriptSigs)` — legacy
  SIGHASH_ALL digest rebuilt from the join-signed tx plus the prevout script, then `secp256k1.verify`
  and a P2PKH pubkey-hash match. Prevout scripts are read from chain, never from the document.
- `combine(tx, signatures, scriptSigs)` → `{ hex, txid }`.

**`src/lib/dissolution.ts`** — `verifyDissolution(pool, members, collateralIndex, registeredHeight, signedHex)`:
one input spending `(proTxHash, collateralIndex)`, fee ≤ 1,000,000 duffs, non-actor refunds ≥ amount +
bonus with `Σ bonus ≥ P` and `≤ earlyPenalty`, where `P = earlyPenalty` inside the early period and 0
after it, last output the actor's remainder, and a signature by the actor's owner key over
`dissolveSignHash(tx, 1)`. Structural findings and the signature verdict are reported separately so the
UI can explain a refusal.

**`src/data/live/chain.ts`** — replaces `dapiCore.ts` (deleted). Wraps `DashCoreSDK`:
- `getTransaction` → parse `dapiTransaction.transaction` via `Transaction.fromBytes`, map height 0 to null.
- `getOutputValue`, `broadcastTransaction`, `getBestBlockHeight`.
- a `getPrevout(outpoint) → { script, value }` accessor for scriptSig verification.
- `getMasternodeListHeight()` — height of the list we hold, taken from the diff's `cbTx` payload; `null`
  until the first full diff arrives.
- `getMasternode`, `getMasternodeByOperatorKey` over the merged list.

**`src/lib/mnlist.ts`** — CBOR decode (`cbor-x` or `cbor`, small dependency) plus a `SimplifiedMNList`
store:
- full diff (`baseBlockHash` = zero hash) replaces the map; incremental diffs apply `deletedMNs` then
  `mnList`; a diff whose `baseBlockHash` isn't our current `blockHash` triggers a resubscribe.
- entries keep `proTxHash`, `isValid`, `nType`, `addresses.core_p2p` (with the deprecated `service` field
  as fallback, absent unless `-deprecatedrpc=service`), and the raw `pubKeyOperator` string.
- operator-key comparison is verbatim (same scheme). A v3 ProRegTx key is basic-scheme by consensus, so
  the same bytes cannot name a legacy-scheme node's key; the blind spot is documented in code, and pool
  creation validates separately that the key is a well-formed basic-scheme BLS key.

**`src/lib/status.ts`** — FORMED / ERROR / DISSOLVED require `listHeight >= registeredHeight`; while the
list is behind (or not yet initialized) a mined registration stays SIGNING with a "waiting for the
masternode list" reason instead of flipping to DISSOLVED.

**`src/data/live/txBuilder.ts`** — adapter implementing `TxBuilder`, constructed with the chain source so
scriptSig verification can fetch prevout scripts. Bigint ↔ number conversion lives here.

**Interface change in `src/data/types.ts`** — `verifyScriptSigs` and `extractScriptSigs` take the
join-signed `joinedHex` (the digest covers the joinSigs). `ChainSource` gains `getMasternodeListHeight`
and `getPrevout`. Ripples through `mockTxBuilder`, `queries.ts`, `SignPanel`, `status.ts`.

**`src/components/JoinDialog.tsx`** — reject non-P2PKH prevouts when the join is composed (fetch and check
the prevout script before publishing, since a published join is immutable), and re-check at lock.

**`src/components/SignPanel.tsx`** — real hex; step 1 shows the funding hex and the full
`protx shared_register_prepare` command with its parameters, plus "paste Core's `consentHash` / `tx` to
compare"; step 2 shows the join-signed hex with `protx shared_sign` / `shared_combine` /
`signrawtransactionwithwallet`; errors surfaced per step.

**`src/operators.ts`** — placeholder operators must not be offered on testnet.

**`src/config.ts`** — `features.registration: true`; DAPI URLs handed to `DashCoreSDK`.

**`v2/package.json`** — `dash-core-sdk@1.1.5-dev.2` (published after the SDK work).

**`DESIGN.md` §10** — correct the wallet-command table to the real v24 RPCs: `shared_register_prepare`
takes the funding tx and prints the consent hash; `shared_sign` returns signatures only; `shared_combine`
assembles; `shared_dissolve_prepare` exposes the dissolve digest. Note Core's recommendation that each
participant store a zero-penalty standby dissolution, which supersedes the "unnecessary" sentence.

## Verification plan

**Stage 0 — digests against Core (regtest, no Platform, no testnet funds).**
1. Build a funding tx with two shares in the app code, run
   `protx shared_register_prepare <fundingHex> '[...]' ...` on a v24 regtest node → Core returns `tx`,
   `collateralIndex`, `consentHash`. Ours must equal all three; any difference is a field-order bug.
2. `protx shared_sign <tx>` → signatures; our `verifyCompact` must accept them, and our re-insertion must
   reproduce Core's `shared_combine` output byte for byte.
3. `signrawtransactionwithwallet` → our scriptSig verification must accept the funding signatures, and
   `sendrawtransaction` must be accepted; then `protx list` shows the pool as valid.
4. `protx shared_dissolve_prepare` → our `dissolveSignHash` must equal Core's `signHash`; tampering with
   one output must reject the signature in `verifyDissolution`.
This proves the consensus-critical half without 1000 tDASH.

**Stage 1 — live chain source (testnet, read-only).** Capture a real CBOR diff fixture, confirm the
parser against it and against `protx list`, verify `getTransaction`/`getBestBlockHeight` on known values,
confirm the `txindex` assumption holds for an old transaction, and confirm `addresses.core_p2p` appears
without `-deprecatedrpc=service`.

**Stage 2 — app end to end (testnet).**
- 2a: pool with no service address → registers and reports ERROR (by design); proves list merge, height
  gate and status derivation.
- 2b: pool with a unique service address and a basic-scheme operator key → FORMED once mined, with the
  address read from the list. PoSe penalties may later turn it ERROR; that is expected and observable.
- Then a unilateral dissolution, prepared in Core and verified by the app.

**Stage 3 — regressions.** `npm run typecheck` in `v2/`, `npm test` and `npm run lint` in the SDK.

## Risks

- **Operator key string format.** `pubKeyOperator` is printed by Core's BLS wrapper; the scheme may be
  encoded in the string. Mitigation: capture a real diff entry in Stage 1 and pin the comparison there.
- **SDK bundling under Vite** (protobuf runtime, `typescript` listed as a runtime dependency).
  Mitigation: a one-line import smoke test before the integration work.
- **Determinism regressions.** If the builder depends on anything outside the documents, every existing
  consent breaks. Mitigation: build twice from the same inputs and compare bytes.
- **Dust constant.** A wrong threshold burns change or gets the broadcast rejected as non-standard.
  Mitigation: pin from `getnetworkinfo`, keep it in one constant.
- **Testnet funds and an operator.** A registration needs 1000 tDASH and, for FORMED, a free unique
  service address plus a real basic-scheme operator key. The machine has no `dashd` and no funded testnet
  wallet today. Stage 0 avoids this; Stage 2 does not.

## Decisions made here (check these)

- SDK functions are standalone exports (`consentHash`, `dissolveSignHash`, `signCompact`,
  `recoverCompact`, `verifyCompact`), not methods on `Transaction` or payload classes.
- The SDK version is published as a dev release (`1.1.5-dev.2`), not consumed through a `file:` link, so
  the app's build matches what the wallet can later install.
- The builder emits the funding tx and the full regtx; `fundingHex` is what the UI hands to Core.
- `TxBuilder.verifyScriptSigs` / `extractScriptSigs` gain a `joinedHex` argument.
- Prevout scripts for scriptSig verification come from `getTransaction`, never from `join` documents.
- Joins are restricted to **P2PKH** prevouts (owner keys are P2PKH by Core's requirement anyway); the
  restriction is enforced before the join is published and re-checked at lock.
- Masternode-list freshness gates every terminal status; a lagging list is never read as DISSOLVED.
- Operator-key matching is verbatim within a scheme; no BLS re-encoding dependency in the app.
- `dapiCore.ts` is deleted rather than kept as a fallback.
- The app does not build or sign a ProDisTx; it only verifies one.
- Consensus defects are fixed upstream in `dash-core-sdk`, never patched around in `v2/`.

## Left to the builder

- Exact module boundaries inside `registration.ts` (funding vs payload assembly).
- CBOR library choice and diff store details (quorum data ignored, resubscribe policy).
- Error taxonomy and copy for refused signatures/transactions.
- Whether the "check with Core" block shows the command, the parameters, or both.