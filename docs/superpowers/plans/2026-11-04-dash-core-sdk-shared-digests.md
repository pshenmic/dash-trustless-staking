# dash-core-sdk shared-masternode digests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `consentHash`, `dissolveSignHash` and compact ECDSA sign/recover to `dash-core-sdk` so the dapp and Dash Desktop Wallet can compute v24 shared-masternode digests identically to Dash Core.

**Architecture:** Three standalone modules re-exported from `index.ts`, built on the SDK's existing `Transaction`, `PrivateKey`, `PublicKey` and `@noble/curves/secp256k1`. Each digest replays Core's `CHashWriter` field order byte for byte over existing payload primitives; no new consensus logic is invented. Tests pin self-consistency and, once the user supplies Core output, byte-for-byte equality.

**Tech Stack:** TypeScript (ESM), `@noble/curves`, jest + ts-jest, `ts-standard`.

**Spec:** `/Users/pshenmic/WebstormProjects/dash-trustless-staking/docs/superpowers/specs/2026-11-02-protx-registration-design.md`

## Global Constraints

- Repository: `/Users/pshenmic/WebstormProjects/dash-core-sdk`. Work on a **local branch off `origin/master`**, never pushed or published. The local `master` is behind and must not be used as the base.
- Consensus reference: Dash Core `v24.0.x` `src/evo/providertx.cpp` lines 350–388 (`MakeSharedRegConsentHash`) and 516–543 (`CProDisTx::MakeSignHash`). Read them; do not infer field order.
- Both digests return `hw.GetHash()` reversed to hex — display order, same convention as `Transaction.hash()`.
- Amounts are `bigint`; key IDs and hashes are lowercase hex strings.
- Signature format: 65 bytes, header = `27 + recid + (compressed ? 4 : 0)`, low-S (Core's `VerifyHashCanonical` rejects high-S).
- **Commits:** create them only if the user has asked for commits. Otherwise leave the working tree dirty and report the changed files.
- Run `npm test` and `npm run lint` before each commit.

## Review Focus

- A `consentHash` that silently differs from Core's because one integer was written big-endian or one field was omitted — the failure is invisible off-chain and burns a real registration.
- Non-canonical (high-S) signatures accepted by `verifyCompact` but rejected by Core, making a member's consent look valid here and invalid on-chain.
- Compact recovery returning a key whose `hash160` is right but whose compressed/uncompressed header bit is wrong, so Core recovers a different key.
- `dissolveSignHash` compiled with the wrong `sigCount`, letting a unanimous signature pass as unilateral.
- Preconditions silently coerced: calling either digest on a v1/v2 payload or with mismatched `joinSigs` length must throw, not hash garbage.

---

### Task 1: Compact signature module

**Files:**
- Create: `src/compactSignature.ts`
- Modify: `src/types/PublicKey.ts`, `index.ts`
- Test: `tests/CompactSignature.test.ts`

**Interfaces:**
- Consumes: `PrivateKey` (`key: Uint8Array`), `PublicKey` (`bytes()`), `secp256k1` from `@noble/curves/secp256k1.js`.
- Produces:
  - `PublicKey.getKeyID(): string` — lowercase hex of `SHA256RIPEMD160(this.bytes())`.
  - `signCompact(hash: string, privateKey: PrivateKey): string` — 65-byte hex.
  - `recoverCompact(hash: string, signature: string): PublicKey`
  - `verifyCompact(hash: string, signature: string, keyId: string): boolean`

- [ ] **Step 1: Write the failing test**

`tests/CompactSignature.test.ts`, with `KEY = new PrivateKey('...64 hex...')` and `HASH = '11'.repeat(32)`:

```ts
expect(signCompact(HASH, KEY)).toMatch(/^[0-9a-f]{130}$/)
expect(Number.parseInt(signCompact(HASH, KEY).slice(0, 2), 16)).toBeGreaterThanOrEqual(31)
expect(recoverCompact(HASH, signCompact(HASH, KEY)).getKeyID()).toBe(KEY.getPublicKey().getKeyID())
expect(verifyCompact(HASH, signCompact(HASH, KEY), KEY.getPublicKey().getKeyID())).toBe(true)
expect(verifyCompact('22'.repeat(32), signCompact(HASH, KEY), KEY.getPublicKey().getKeyID())).toBe(false)
expect(() => verifyCompact(HASH, '00'.repeat(65), KEY.getPublicKey().getKeyID())).toThrow()
```
Plus a high-S case: take a signature, replace `s` with `n - s` and set the recovery bit to its complement, assert `verifyCompact` is `false`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/CompactSignature.test.ts`
Expected: FAIL — cannot resolve `../src/compactSignature.js`.

- [ ] **Step 3: Implement**

Use `secp256k1.sign(hexToBytes(hash), privateKey.key, { prehash: false, lowS: true, format: 'recovered' })`. In `@noble/curves` v2 the `recovered` format is `r || s || recovery` — the recovery byte is **last**, not first. Build the Core layout from it: `[27 + recovery + (compressed ? 4 : 0), ...r, ...s]`. In `recoverCompact`, read the header, rebuild the noble `recovered` array (recid back at the end), call `secp256k1.recoverPublicKey`, and construct `PublicKey` from the returned point, preserving the compressed flag encoded in the header (the constructor takes the inner point and that flag — read `src/types/PublicKey.ts`). Reject lengths ≠ 65, headers outside 27–34, and any non-canonical (high-S) signature. `getKeyID` uses the existing `SHA256RIPEMD160` util from `utils.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/CompactSignature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if the user asked for commits)

```bash
git add src/compactSignature.ts src/types/PublicKey.ts index.ts tests/CompactSignature.test.ts
git commit -m "Add compact ECDSA sign/recover for shared-masternode consents"
```

---

### Task 2: `consentHash`

**Files:**
- Create: `src/consent.ts`
- Modify: `index.ts`
- Test: `tests/ConsentHash.test.ts`

**Interfaces:**
- Consumes: `Transaction`, `ProRegTX` payload, `CollateralShare.bytes()`, `ExtNetInfo.bytes()`, `SHA256RIPEMD160`/`doubleSHA256` from `utils.js`.
- Produces: `consentHash(tx: Transaction): string`.

- [ ] **Step 1: Write the failing test**

Build a v3 shared registration transaction in the test with two shares (`100e8n` and `900e8n` duffs, distinct refund/reward scripts and owner key IDs), one change output, collateral to `SHARED_COLLATERAL_SCRIPT`, `joinSigs: ['00'.repeat(65), '00'.repeat(65)]`.

```ts
expect(consentHash(tx)).toMatch(/^[0-9a-f]{64}$/)
expect(consentHash(tx)).toBe(consentHash(tx))                       // deterministic
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'shareAmount')))
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'sequence')))
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'ownerKeyId')))
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'changeOutput')))
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'operatorReward')))
expect(consentHash(tx)).not.toBe(consentHash(tamper(tx, 'joinSig')))
expect(() => consentHash(v2PayloadTx)).toThrow(/version/)
expect(() => consentHash(mismatchedJoinSigsTx)).toThrow(/joinSigs/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ConsentHash.test.ts`
Expected: FAIL — `consentHash` is not exported.

- [ ] **Step 3: Implement `consentHash(tx: Transaction): string`**

Write fields in Core's order into a byte accumulator, then `doubleSHA256` and reverse to hex:

`"DashSharedMNReg"` (compactSize length + ASCII) · payload `nVersion` (uint16 LE) · `tx.nVersion` (int16 LE) · `tx.nType` (uint16 LE) · `nLockTime` (uint32 LE) · `SHA256d(concat(prevout bytes))` (32 raw bytes) · each `nSequence` (uint32 LE) · `SHA256d(concat(Output.bytes()))` · `nType` (uint16) · `nMode` (uint16) · `ExtNetInfo.bytes()` · `keyIDVoting` (20) · operator key (48, v3 basic scheme, no tag) · `nOperatorReward` (uint16) · share count (uint8) · each `CollateralShare.bytes()` · `earlyPeriodBlocks` (int32 LE) · `earlyPenalty` (uint32 LE).

Throw on `!(payload instanceof ProRegTX)`, `version < 3`, empty `shares`, `joinSigs.length !== shares.length`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ConsentHash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if asked)

```bash
git add src/consent.ts index.ts tests/ConsentHash.test.ts
git commit -m "Add v24 shared registration consent hash"
```

---

### Task 3: `dissolveSignHash`

**Files:**
- Modify: `src/consent.ts`, `index.ts`
- Test: `tests/DissolveSignHash.test.ts`

**Interfaces:**
- Consumes: `Transaction`, `ProDisTx` payload.
- Produces: `dissolveSignHash(tx: Transaction, sigCount: number): string`.

- [ ] **Step 1: Write the failing test**

Build a `ProDisTx` with `proTxHash`, `actorIndex: 1`, two 65-byte sigs, one input spending `(proTxHash, 2)` with empty scriptSig, three payout outputs.

```ts
expect(dissolveSignHash(tx, 1)).toMatch(/^[0-9a-f]{64}$/)
expect(dissolveSignHash(tx, 1)).not.toBe(dissolveSignHash(tx, 2))   // mode is bound
expect(dissolveSignHash(tx, 1)).not.toBe(dissolveSignHash(tamperOutput(tx), 1))
expect(dissolveSignHash(tx, 1)).not.toBe(dissolveSignHash(tamperSequence(tx), 1))
expect(dissolveSignHash(tx, 1)).not.toBe(dissolveSignHash(tamperActor(tx), 1))
expect(() => dissolveSignHash(tx, 0)).toThrow(/sigCount/)
expect(() => dissolveSignHash(tx, 256)).toThrow(/sigCount/)
expect(() => dissolveSignHash(regTx, 1)).toThrow(/ProDisTx/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/DissolveSignHash.test.ts`
Expected: FAIL — `dissolveSignHash` is not exported.

- [ ] **Step 3: Implement `dissolveSignHash(tx: Transaction, sigCount: number): string`**

Core's order: `"DashSharedMNDissolve"` · payload `nVersion` (uint16) · `tx.nVersion` (int16) · `tx.nType` (uint16) · `nLockTime` (uint32) · every `prevout` (32-byte hash + uint32 vout) · every `nSequence` (uint32) · every output (`Output.bytes()`) · `proTxHash` (32 raw) · `actorIndex` (uint16) · `sigCount` (uint8). `doubleSHA256`, reversed hex.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/DissolveSignHash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only if asked)

```bash
git add src/consent.ts index.ts tests/DissolveSignHash.test.ts
git commit -m "Add v24 ProDisTx dissolve sign hash"
```

---

### Task 4: Pin Core reference vectors

**Files:**
- Create: `tests/fixtures/core-vectors.json`
- Modify: `tests/ConsentHash.test.ts`, `tests/DissolveSignHash.test.ts`

**Interfaces:**
- Consumes: the two digests from Tasks 2–3.
- Produces: nothing new; this is the proof the digests match Core.

- [ ] **Step 1: Ask the user to run Stage 0 and paste the output**

The exact commands, with values substituted (the executor writes these out fully):

1. `protx shared_register_prepare <fundingHex> '[{"amount":...,"refundAddress":...,"rewardAddress":...,"ownerAddress":...}, ...]' ["192.0.2.10:19999"] <operatorPubKey> <votingAddress> <operatorReward> <earlyPeriodBlocks> <earlyPenalty>`
2. `protx shared_sign <tx>`
3. `protx shared_combine <tx> '[{"shareIndex":0,"signature":"..."}, ...]'`
4. `protx shared_dissolve_prepare <proTxHash> <shareIndex> <fee> false`

- [ ] **Step 2: Write the fixtures**

`tests/fixtures/core-vectors.json`:
```json
{
  "fundingHex": "...",
  "registrationHex": "...",
  "consentHash": "...",
  "combinedHex": "...",
  "dissolve": { "proTxHash": "...", "actorIndex": 1, "sigCount": 1, "txHex": "...", "signHash": "..." }
}
```

- [ ] **Step 3: Write the failing assertions**

```ts
const v = require('./fixtures/core-vectors.json')
expect(consentHash(Transaction.fromHex(v.registrationHex))).toBe(v.consentHash)
expect(Transaction.fromHex(v.registrationHex).hex()).toBe(v.registrationHex)      // re-serialization
expect(dissolveSignHash(Transaction.fromHex(v.dissolve.txHex), v.dissolve.sigCount)).toBe(v.dissolve.signHash)
```

- [ ] **Step 4: Run and fix**

Run: `npx jest tests/ConsentHash.test.ts tests/DissolveSignHash.test.ts`
Expected: PASS. Any mismatch is a serialization bug in Tasks 2–3 — fix there, never by editing the fixture.

- [ ] **Step 5: Commit** (only if asked)

```bash
git add tests/fixtures/core-vectors.json tests/ConsentHash.test.ts tests/DissolveSignHash.test.ts
git commit -m "Pin consent and dissolve hashes against Dash Core v24 output"
```

---

### Task 5: Build and document the API

**Files:**
- Modify: `README.md`
- Verify: `index.js`, `index.d.ts` (build output)

**Interfaces:**
- Produces: a built package the dapp can depend on through `file:`.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: exit 0; `index.d.ts` declares `consentHash`, `dissolveSignHash`, `signCompact`, `recoverCompact`, `verifyCompact`.

- [ ] **Step 2: Verify the built entry point**

Run: `node -e "import('./index.js').then(m => console.log(typeof m.consentHash))"`
Expected: `function`.

- [ ] **Step 3: Document in README**

One short section per function: signature, what it hashes, and the Core RPC that reproduces it. Note that only v3 shared payloads are supported and that signatures must be canonical.

- [ ] **Step 4: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS with no lint errors.

- [ ] **Step 5: Commit** (only if asked)

```bash
git add README.md
git commit -m "Document shared-masternode digest API"
```