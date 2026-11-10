# v2 ProRegTx integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock transaction layer in `v2/` with a real shared ProRegTx builder, real chain I/O over `dash-core-sdk`, and a CBOR masternode list, so a pool can be created, funded, registered and dissolved on testnet with the user signing in Dash Core.

**Architecture:** Pure logic in `src/lib` (registration, dissolution, mnlist, status) with no I/O; thin adapters in `src/data/live` implement the existing `TxBuilder`/`ChainSource` ports. The app never holds keys: it builds hex, shows the matching `protx` command, and verifies what comes back before publishing.

**Tech Stack:** React 19 + Vite 7 + TypeScript, `dash-core-sdk` (local `file:` dependency), `cbor2`, vitest, TanStack Query, dash-platform-sdk.

**Spec:** `/Users/pshenmic/WebstormProjects/dash-trustless-staking/docs/superpowers/specs/2026-11-02-protx-registration-design.md`
**Depends on:** `2026-11-04-dash-core-sdk-shared-digests.md` (Tasks 1–5 there must be done and built).

## Global Constraints

- Repository: `/Users/pshenmic/WebstormProjects/dash-trustless-staking`, app in `v2/`. Branch `feat/v2`.
- `v2/` has **no test runner today**; Task 1 adds vitest. Tests are colocated `*.test.ts` beside the module.
- `npm run typecheck` (`tsc -b`) must pass after every task; `npm test` must pass before each commit.
- Money is `number` duffs in `src/lib`, `bigint` duffs inside the SDK. Convert only in `src/data/live/txBuilder.ts`.
- Never store, request or derive a private key in the app. Signing is copy-paste only.
- `consentHash`/`dissolveSignHash` come from `dash-core-sdk`. Do not reimplement either in `v2/`.
- `SHARED_COLLATERAL_SCRIPT = '04445348437551'`, collateral exactly `100000000000` duffs, 2–8 shares, `earlyPenalty ≤ 1000000` duffs (imported from `src/lib/consensus.ts`, never literals).
- Dust threshold for change: `546` duffs, one named constant.
- **Commits:** create them only if the user has asked for commits. Otherwise leave the work uncommitted and report changed files.

## Review Focus

- A join whose prevouts are not P2PKH → the app builds a tx whose scriptSigs it can never verify; must be rejected before the immutable join is published.
- A registration block newer than the masternode list → must read "waiting for the list", never DISSOLVED.
- A member's funding signature over the pre-consent tx bytes → must be rejected, because the digest covers `joinSigs`.
- A pasted ProDisTx whose outputs pay the actor more than the rules allow → must be refused with a reason, not broadcast.
- A registration built twice from identical documents → must produce identical bytes, or every consent already collected is invalidated.

## File Structure

- `src/lib/registration.ts` — funding tx, full regtx, joinSigs, scriptSigs, combine (pure)
- `src/lib/dissolution.ts` — `verifyDissolution` structure and signature checks (pure)
- `src/lib/mnlist.ts` — CBOR diff decode and merged list store (pure)
- `src/lib/status.ts` — existing, gains list-height gating
- `src/data/live/chain.ts` — `DashCoreSDK` adapter (replaces `dapiCore.ts`)
- `src/data/live/txBuilder.ts` — `TxBuilder` adapter, duff conversion, prevout prefetch
- `src/data/types.ts` — port interfaces (changed)
- `src/components/SignPanel.tsx`, `JoinDialog.tsx`, `DissolveDialog.tsx`, `src/config.ts`, `src/operators.ts` — UI

---

### Task 1: Test runner, SDK dependency, import smoke test

**Files:**
- Modify: `v2/package.json`, `v2/vite.config.ts`
- Test: `src/data/live/sdkSmoke.test.ts`

**Interfaces:**
- Produces: `npm test` runs vitest; `dash-core-sdk` and `cbor2` importable from both node and the Vite bundle.

- [ ] **Step 1: Write the failing test**

```ts
import { Transaction, SHARED_COLLATERAL_SCRIPT } from 'dash-core-sdk'
expect(SHARED_COLLATERAL_SCRIPT).toBe('04445348437551')
expect(Transaction.fromHex(KNOWN_TX_HEX).txid).toBe(KNOWN_TXID)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd v2 && npx vitest run src/data/live/sdkSmoke.test.ts`
Expected: FAIL — vitest not installed / `dash-core-sdk` not found.

- [ ] **Step 3: Install and wire**

`npm i -D vitest`, add `"test": "vitest run"`. Add `"dash-core-sdk": "file:../dash-core-sdk"` and `"cbor2": "^2.3.0"`. Build the SDK first (`cd ../dash-core-sdk && npm run build`). If Vite trips on the SDK's protobuf runtime, add it to `optimizeDeps.include`.

- [ ] **Step 4: Verify both runtimes**

Run: `npm test` then `npm run build`
Expected: test PASS and the Vite build exits 0.

- [ ] **Step 5: Commit** (only if asked)

```bash
git add v2/package.json v2/package-lock.json v2/vite.config.ts v2/src/data/live/sdkSmoke.test.ts
```

---

### Task 2: Masternode list decoding

**Files:**
- Create: `v2/src/lib/mnlist.ts`, `v2/scripts/capture-mnlist.mjs`, `v2/src/lib/mnlist.test.ts`, `v2/src/lib/fixtures/mnlist-diff.cbor.json`

**Interfaces:**
- Consumes: `cbor2.decode`, `Transaction` from `dash-core-sdk`.
- Produces:
  - `interface MnListEntry { proTxHash: string, isValid: boolean, service: string | null, operatorPubKey: string }`
  - `interface MnListDiff { baseBlockHash: string, blockHash: string, height: number | null, deleted: string[], added: MnListEntry[] }`
  - `parseMnListDiff(bytes: Uint8Array): MnListDiff`
  - `class SimplifiedMNList { apply (diff: MnListDiff): void; get (proTxHash: string): MnListEntry | null; byOperatorKey (key: string): MnListEntry | null; get height (): number | null; get needsResync (): boolean }`

- [ ] **Step 1: Capture a real diff**

`scripts/capture-mnlist.mjs` connects with `DashCoreSDK` to a testnet DAPI URL, calls `subscribeToMasternodeList()`, takes the first response, and writes `src/lib/fixtures/mnlist-diff.cbor.json` as `{ "hex": "..." }`. Run it once: `node v2/scripts/capture-mnlist.mjs`.

- [ ] **Step 2: Write the failing test**

```ts
const diff = parseMnListDiff(hexToBytes(fixture.hex))
expect(diff.baseBlockHash).toBe('00'.repeat(32))
expect(diff.blockHash).toMatch(/^[0-9a-f]{64}$/)
expect(diff.height).toBeGreaterThan(0)
expect(diff.added.length).toBeGreaterThan(100)
expect(diff.added[0]).toEqual({ proTxHash: expect.any(String), isValid: expect.any(Boolean), service: expect.anything(), operatorPubKey: expect.any(String) })

const list = new SimplifiedMNList()
list.apply(diff); expect(list.height).toBe(diff.height)
list.apply({ ...emptyIncrement, baseBlockHash: diff.blockHash, blockHash: 'aa'.repeat(32), height: diff.height + 1, deleted: [diff.added[0].proTxHash], added: [] })
expect(list.get(diff.added[0].proTxHash)).toBeNull()
list.apply({ ...emptyIncrement, baseBlockHash: 'ff'.repeat(32) })
expect(list.needsResync).toBe(true)
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/mnlist.test.ts` — FAIL, module missing.

- [ ] **Step 4: Implement `parseMnListDiff` and `SimplifiedMNList`**

Decode CBOR to a plain object. Map `mnList` entries to `MnListEntry` using `proTxHash`, `isValid`, `addresses.core_p2p ?? service ?? null`, `pubKeyOperator`. Height: `Transaction.fromHex(diff.cbTx).payload.height`, `null` if parsing fails. `apply` replaces the map for a full diff (`baseBlockHash` all zeros), applies deletions then additions for an increment, and sets `needsResync` when `baseBlockHash` is neither zeros nor the current `blockHash`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/mnlist.test.ts` — PASS.

- [ ] **Step 6: Commit** (only if asked)

---

### Task 3: Status gating on list height

**Files:**
- Modify: `v2/src/lib/status.ts`, `v2/src/data/queries.ts`
- Test: `v2/src/lib/status.test.ts`

**Interfaces:**
- Produces: `derivePoolStatus(input)` gains `masternodeListHeight: number | null`; adds reason `'awaiting-list'`.

- [ ] **Step 1: Write the failing test**

```ts
expect(derivePoolStatus({ ...base, regTx: { txid, height: 500 }, masternode: null, masternodeListHeight: 499 }).status).toBe('SIGNING')
expect(derivePoolStatus({ ...base, regTx: { txid, height: 500 }, masternode: null, masternodeListHeight: 500 }).status).toBe('DISSOLVED')
expect(derivePoolStatus({ ...base, regTx: { txid, height: 500 }, masternode: null, masternodeListHeight: null }).status).toBe('SIGNING')
expect(derivePoolStatus({ ...base, regTx: { txid, height: 500 }, masternode: { isValid: true, service: '1.2.3.4:9999' }, masternodeListHeight: 499 }).status).toBe('SIGNING')
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/status.test.ts`, expect type error or wrong status.

- [ ] **Step 3: Implement the gate**

Before returning FORMED / ERROR / DISSOLVED: if `regTx != null` and (`masternodeListHeight == null` or `masternodeListHeight < regTx.height`), return `{ status: 'SIGNING', reason: 'awaiting-list' }`. In `queries.ts`, fetch `chain.getMasternodeListHeight()` alongside `getMasternode`/`getRegisteredHeight` and pass it through.

- [ ] **Step 4: Run to verify it passes** — PASS, then `npm run typecheck`.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 4: Funding transaction builder

**Files:**
- Create: `v2/src/lib/registration.ts`, `v2/src/lib/registration.test.ts`

**Interfaces:**
- Consumes: `Pool`, `Join`, `Duffs`, `addressToScript` (`src/lib/address.ts`), `FEE_PER_BYTE`-style constants from `src/lib/consensus.ts` where present.
- Produces: `buildFundingTx(pool: Pool, members: Join[], inputValues: Map<string, Duffs | null>): { hex: string, tx: Transaction, problems: Problem[] }`.

- [ ] **Step 1: Write the failing test**

Two joins of `600e8n`/`400e8n` duffs with 2 inputs each, a `100_000` duff fee in `pool.fee`, and one missing input value:

```ts
expect(buildFundingTx(pool, members, values).problems).toEqual([])
const tx = Transaction.fromHex(buildFundingTx(pool, members, values).hex)
expect(tx.inputs.map(i => i.txId)).toEqual(members.flatMap(m => m.inputs.map(i => i.txid)))   // share order
expect(tx.outputs.reduce((s, o) => s + Number(o.satoshis), 0n)).toBe(totalIn - fee)
expect(buildFundingTx(pool, members, values).hex).toBe(buildFundingTx(pool, members, values).hex)  // deterministic
expect(buildFundingTx(pool, members, valuesWithNull).problems.map(p => p.code)).toContain('missing-input-value')
expect(buildFundingTx(pool, members, valuesDustChange).hex).not.toContain(dustChangeScript)     // dust omitted
```

- [ ] **Step 2: Run to verify it fails** — FAIL, module missing.

- [ ] **Step 3: Implement `buildFundingTx`**

Version 3, type 0. Inputs in `lock.joinIds` order, then each join's inputs in document order, `sequence = 0xffffffff`, empty scriptSig. One change output per member to `join.changeAddress` when `in − out − feeShare ≥ 546`, in share order. No collateral output here. Collect `problems` (`missing-input-value`, `dust-change-dropped`, `fee-exceeds-inputs`) instead of throwing.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 5: Registration transaction and consent hash

**Files:**
- Modify: `v2/src/lib/registration.ts`, `v2/src/lib/registration.test.ts`

**Interfaces:**
- Consumes: `buildFundingTx`, `consentHash` from `dash-core-sdk`, `ExtNetInfo`, `CollateralShare`, `ProRegTX`.
- Produces: `buildRegistration(pool, members, inputValues): RegistrationTx` with `{ fundingHex, unsignedHex, consentHash, collateralIndex, members, problems }`.

- [ ] **Step 1: Write the failing test**

```ts
const r = buildRegistration(pool, members, values)
expect(r.problems).toEqual([])
expect(r.consentHash).toMatch(/^[0-9a-f]{64}$/)
expect(Transaction.fromHex(r.unsignedHex).payload.shares.map(s => s.amount)).toEqual([60000000000n, 40000000000n])
expect(Transaction.fromHex(r.unsignedHex).outputs[r.collateralIndex].script.hex()).toBe(SHARED_COLLATERAL_SCRIPT)
expect(Transaction.fromHex(r.unsignedHex).payload.joinSigs).toEqual(['00'.repeat(65), '00'.repeat(65)])
expect(r.collateralIndex).toBe(Transaction.fromHex(r.unsignedHex).outputs.length - 1)
// funding tx is the prepare input: collateral is appended, everything before it matches
expect(r.consentHash).toBe(consentHash(Transaction.fromHex(r.unsignedHex)))
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

Take the funding tx, append the 1000 DASH collateral output (`SHARED_COLLATERAL_SCRIPT`), set `nType = 1`, attach a v3 `ProRegTX` with `keyIDVoting` from `pool.votingAddress`, `pubKeyOperator` from `pool.operatorPubKey`, `operatorReward`, shares from each join (`amount`, refund script, reward script, owner key id), `ExtNetInfo` from `pool.service`, `earlyPeriodBlocks`, `earlyPenalty`, and zeroed `joinSigs`. Then `consentHash(tx)` from the SDK. Never reorder outputs after this point.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 6: Join signatures, scriptSigs, combine

**Files:**
- Modify: `v2/src/lib/registration.ts`, `v2/src/lib/registration.test.ts`

**Interfaces:**
- Produces:
  - `withJoinSignatures(tx: RegistrationTx, signatures: string[]): string`
  - `extractScriptSigs(joinedHex: string, members: Join[], shareIndex: number, signedHex: string): string[] | null`
  - `verifyScriptSigs(joinedHex: string, members: Join[], shareIndex: number, scriptSigs: string[], prevout: (op: Outpoint) => Prevout | null): boolean`
  - `combine(tx: RegistrationTx, signatures: string[], scriptSigs: string[][]): { hex: string, txid: string }`

- [ ] **Step 1: Write the failing test**

Use `Transaction.sign()` from the SDK in the test to create genuine funding signatures over a synthesized prevout:

```ts
const joined = withJoinSignatures(r, [sig0, sig1])
expect(Transaction.fromHex(joined).payload.joinSigs).toEqual([sig0, sig1])
expect(verifyScriptSigs(joined, members, 0, sigsForShare0, lookup)).toBe(true)
expect(verifyScriptSigs(withJoinSignatures(r, ['00'.repeat(65), sig1]), members, 0, sigsForShare0, lookup)).toBe(false)  // digest moved
expect(verifyScriptSigs(joined, members, 0, sigsForShare1, lookup)).toBe(false)   // wrong member
expect(extractScriptSigs(joined, members, 0, signedHexForShare0)).toEqual(sigsForShare0)
expect(extractScriptSigs(joined, members, 0, 'deadbeef')).toBeNull()
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

`withJoinSignatures` sets `payload.joinSigs` and re-serializes. `extractScriptSigs` parses the pasted tx, checks the non-scriptSig fields equal the joined tx, and returns the scriptSigs for that member's input range (null otherwise). `verifyScriptSigs` rebuilds the legacy SIGHASH_ALL digest per input from the joined tx plus the prevout script, parses sig+pubkey from the scriptSig, and requires a P2PKH match — return false for non-P2PKH prevouts. `combine` fills scriptSigs in share order, returns hex and txid.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 7: Dissolution verification

**Files:**
- Create: `v2/src/lib/dissolution.ts`, `v2/src/lib/dissolution.test.ts`

**Interfaces:**
- Consumes: `dissolveSignHash`, `verifyCompact` from `dash-core-sdk`, `previewUnilateralDissolve` from `src/lib/rules.ts`.
- Produces: `interface DissolutionContext { proTxHash, collateralIndex, members: Join[], earlyPeriodBlocks, earlyPenalty, registeredHeight: number | null, height }`, `verifyDissolution(ctx: DissolutionContext, signedHex: string): { ok: boolean, findings: string[] }`.

- [ ] **Step 1: Write the failing test**

Build a ProDisTx with the SDK, sign it with a throwaway `PrivateKey` matching `members[actor].ownerAddress`:

```ts
expect(verifyDissolution(ctx, goodHex).ok).toBe(true)
expect(verifyDissolution(ctx, tampered('output')).findings).toContain('refund-below-minimum')
expect(verifyDissolution(ctx, tampered('actor')).findings).toContain('signature-mismatch')
expect(verifyDissolution(copyWithScriptSig(ctx), goodHex).findings).toContain('input-scriptsig-not-empty')
expect(verifyDissolution({ ...ctx, registeredHeight: null }, goodHex).findings).toContain('not-registered')
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

Checks, each appended to `findings`: not registered; exactly one input spending `(proTxHash, collateralIndex)` with an empty scriptSig; fee ≤ 1,000,000; `sigs.length` is 1 (actor only) or `members.length` (all, in share order); every non-actor output ≥ `amount + bonus` with `Σ bonus` within `P .. earlyPenalty`; last output is the actor's remainder; each signature verified with `verifyCompact(dissolveSignHash(tx, sigs.length), sig, ownerKeyId)`.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 8: Live chain source over the SDK

**Files:**
- Create: `v2/src/data/live/chain.ts`
- Delete: `v2/src/data/live/dapiCore.ts`
- Modify: `v2/src/data/live/index.ts`, `v2/src/config.ts`
- Test: `v2/src/data/live/chain.test.ts`

**Interfaces:**
- Produces: `createLiveChain(config: { dapiUrls: string[], network: 'testnet' | 'mainnet' }): ChainSource`, where `ChainSource` gains `getPrevout(outpoint): Promise<Prevout | null>` and `getMasternodeListHeight(): Promise<number | null>`.

- [ ] **Step 1: Write the failing test** (unit, injected transport double)

```ts
expect(await chain.getTransaction('00'.repeat(32))).toBeNull()
expect(await chain.getOutputValue({ txid, vout: 1 })).toBe(6_000_000_000)
expect(await chain.getPrevout({ txid, vout: 1 })).toEqual({ script: expect.any(String), value: 6_000_000_000 })
expect(await chain.getMasternodeListHeight()).toBeNull()          // before the first diff
expect(chain.getMasternode(unknown)).resolves.toBeNull()
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

Hold one `DashCoreSDK` instance. `getTransaction` maps `dapiTransaction.height || null`. Start the `subscribeToMasternodeList()` stream on first use, decode with `parseMnListDiff`, apply to a module-level `SimplifiedMNList`, and resubscribe when `needsResync`. Implement `getMasternode`, `getMasternodeByOperatorKey`, `getRegisteredHeight` (height of the regtx), `broadcastTransaction`, `getBestBlockHeight`. Delete `dapiCore.ts` and update imports in `index.ts`.

- [ ] **Step 4: Run to verify it passes** — PASS, `npm run typecheck`.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 9: Live `TxBuilder` adapter

**Files:**
- Create: `v2/src/data/live/txBuilder.ts`
- Modify: `v2/src/data/live/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–8.
- Produces: `createLiveTxBuilder(chain: ChainSource, platform: PlatformSource): TxBuilder`.

- [ ] **Step 1: Write the failing test** (mock chain/prevouts)

```ts
const tx = createLiveTxBuilder(fakeChain, fakePlatform)
const r = tx.buildRegistration(pool, members, values)
expect(tx.verifyConsent(r, 0, goodSig)).toBe(true)
expect(tx.verifyConsent(r, 0, sigForOtherMember)).toBe(false)
expect(tx.verifyScriptSigs(tx.withJoinSignatures(r, sigs), members, 0, scriptSigs0)).toBe(true)
expect(tx.verifyDissolution(ctx, goodHex).ok).toBe(true)
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

Delegate to `src/lib/*`, prefetch prevouts for the member's inputs through `chain.getPrevout`, convert duffs at this boundary only, and wrap the SDK's `verifyCompact` in `verifyConsent`. `verifyDissolution` takes a context object (see Task 7) rather than a bare proTxHash.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 10: Wire interfaces through the data layer

**Files:**
- Modify: `v2/src/data/types.ts:86-103`, `v2/src/data/queries.ts`, `v2/src/data/mock/mockTxBuilder.ts`, `v2/src/data/mock/mockBackend.ts:255-262`

**Interfaces:**
- Produces: `TxBuilder.verifyScriptSigs(joinedHex, members, shareIndex, scriptSigs)`; `TxBuilder.extractScriptSigs(joinedHex, members, shareIndex, signedHex)`; `TxBuilder.verifyDissolution(ctx, signedHex): { ok, findings }`; `RegistrationTx.fundingHex`; `PoolState.collateralIndex: number | null`.

- [ ] **Step 1: Update the mock and watch the typecheck fail**

Change the mock signatures first; `npm run typecheck` must report every call site that needs the new arguments.

- [ ] **Step 2: Fix `queries.ts`**

Compute `joinedHex = txBuilder.withJoinSignatures(registration, consents)` once before validating fundings, pass it to `verifyScriptSigs`, and expose `collateralIndex` in `PoolState`.

- [ ] **Step 3: Fix remaining call sites**

`SignPanel.tsx:30-37`, `DissolveDialog.tsx:35`, `MembersTab.tsx:62`, `mockBackend.ts:259-260`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 11: UI, feature flags, operator list, DESIGN §10

**Files:**
- Create: `v2/src/lib/commands.ts`
- Modify: `v2/src/components/SignPanel.tsx`, `v2/src/components/JoinDialog.tsx`, `v2/src/components/DissolveDialog.tsx`, `v2/src/pages/CreatePoolPage.tsx`, `v2/src/config.ts`, `v2/src/operators.ts`, `DESIGN.md` §10
- Test: `v2/src/lib/commands.test.ts`

**Interfaces:**
- Produces: `sharedRegisterPrepareCommand(registration, pool, members): string`, `sharedSignCommand(joinedHex): string`, `joinPrevoutProblems(prevouts: (Prevout | null)[]): string[]` and `operatorKeyProblems(key: string): string[]` in `src/lib/commands.ts`.

- [ ] **Step 1: Write the failing test**

```ts
expect(sharedRegisterPrepareCommand(r, pool, members)).toContain(`protx shared_register_prepare ${r.fundingHex}`)
expect(sharedRegisterPrepareCommand(r, pool, members)).toContain(`"amount":60000000000`)
expect(sharedSignCommand(joined)).toBe(`protx shared_sign ${joined}`)
expect(joinPrevoutProblems([p2pkh, p2pkh])).toEqual([])
expect(joinPrevoutProblems([p2pkh, null])).toContain('prevout-not-found')
expect(joinPrevoutProblems([p2pkh, p2sh])).toContain('not-p2pkh')
expect(operatorKeyProblems('ab'.repeat(48))).toEqual([])
expect(operatorKeyProblems('ab'.repeat(96))).toContain('not-48-bytes')
expect(operatorKeyProblems('zz'.repeat(48))).toContain('not-hex')
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement the UI changes**

`SignPanel`: show `fundingHex` + `shared_register_prepare` command and an optional "paste Core's consentHash" comparison field; show `joinedHex` + `shared_sign`; render `problems` and per-step errors. `JoinDialog`: fetch each prevout, refuse to publish unless `joinPrevoutProblems` is empty. `CreatePoolPage`: refuse an operator key that fails `operatorKeyProblems`. `DissolveDialog`: build `DissolutionContext` from `state` and show `findings`. `config.ts`: `features.registration: true`. `operators.ts`: on testnet, replace the placeholder operator list with a notice that an operator key and unique `ip:port` must be supplied.

- [ ] **Step 4: Rewrite `DESIGN.md` §10's command table**

`shared_register_prepare` takes the funding tx and prints `tx`/`collateralIndex`/`consentHash`; `shared_sign` returns signatures only; `shared_combine` assembles; `shared_dissolve_prepare` exposes the dissolve digest; note Core's recommendation to store a zero-penalty standby dissolution.

- [ ] **Step 5: Verify** — `npm run typecheck && npm test && npm run build`.

- [ ] **Step 6: Commit** (only if asked)

---

### Task 12: Testnet runbook

**Files:**
- Create: `docs/testnet-runbook.md`

- [ ] **Step 1: Write the runbook**

Stage 0 (Core vectors), Stage 1 (list fixture, txindex check), Stage 2a (ERROR pool), 2b (FORMED pool, unique service), dissolve. Every step: exact command, the app value it corresponds to, and the expected output. Include the `file:` build step and how to paste results back.

- [ ] **Step 2: Dry-run the commands against the app's rendered values**

Open the app with mock data, copy each rendered command, and confirm every placeholder is filled — no `<angle-bracket>` left.

- [ ] **Step 3: Commit** (only if asked)