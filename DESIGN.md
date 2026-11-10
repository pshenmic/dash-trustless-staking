# Dash Trustless Staking v2 — Design

Status: draft, agreed 2026-09-30.

## 1. Overview

v2 replaces the v1 Node.js CLI and its N-of-N P2SH multisig approach with a **React dapp** that coordinates the
registration of **Dash Core v24 shared masternodes** (Decentralized Masternode Shares). The dapp runs no backend
of its own. It coordinates through Dash Platform documents and reads chain state through DAPI.

- **Pool = one shared masternode.** A pool creator publishes the masternode terms. Members join to take a share.
  The creator selects members whose shares total exactly 1000 DASH, and the members sign.
- **Trustless funds.** Dash Core consensus enforces refunds, penalties, reward splitting and dissolution.
  The dapp, Platform and the pool creator never control member funds.
- **Keys never touch the dapp.** Every signature is produced in the member's wallet and pasted (or passed) back.
- **DAPI only.** No Insight, indexer or Core RPC proxy, so anyone can download the dapp and run it against DAPI alone.
- **Transaction logic lives in `dash-core-sdk`.** `@dashevo/dashcore-lib` is no longer used.

### Why v1 is replaced

v1 had these problems:
- It locked collateral in an N-of-N P2SH, so one missing member froze everyone's funds, and the bailout transaction was never built.
- It put P2SH script hashes into `keyIDOwner`/`keyIDVoting`, where they can't sign.
- It paid rewards into an N-of-N multisig.
- The pool creator held the operator key.

The v24 protocol solves the first three problems in consensus.

## 2. Protocol background (Dash Core v24)

Source: `dash/doc/release-notes-7437.md`, `src/evo/providertx.{h,cpp}`, `src/evo/specialtxman.cpp`.
The protocol is active only after the `DEPLOYMENT_V24` hard fork.

**Shared ProRegTx** (type 1, payload version 3 / ExtAddr, Regular masternodes only, no EvoNodes)
- Share table: 2–8 entries `{amount, scriptRefund, scriptReward, keyIDOwner}`.
  - Each `amount` is ≥ 100 DASH, and the amounts sum to exactly 1000 DASH.
  - Refund scripts are immutable. The reward script defaults to the refund script and can be updated later.
- Key rules:
  - Owner keys and refund scripts are unique. Owner keys are also unique across the whole masternode list.
  - Refund and reward scripts must be P2PKH or P2SH, and must not pay the voting key or any share owner key.
- The collateral must be an output of the ProRegTx itself, paying the template script `04445348437551`
  (`0x04 "DSHC" OP_DROP OP_TRUE`). That output can only be spent by a ProDisTx.
- `keyIDOwner` is null, `payouts` is empty, and `vchSig` is empty.
- `nEarlyPeriodBlocks` ≤ 420480. `nEarlyPenalty` must be below the smallest share, and must be 0 when there is no early period.
- `vchJoinSigs`: one 65-byte compact signature per share over the **consent hash** (§7).

**ProDisTx** (type 10) dissolves the masternode. It has one input (the collateral) and refunds every share to its refund script.
- *Unilateral* mode: a single signature by the actor. The actor pays `nEarlyPenalty`, pro rata to the others, while inside the early period.
- *Unanimous* mode: one signature per share, no penalty.
- The fee is capped at 1,000,000 duffs.
- Validity is monotone: once valid, a ProDisTx stays valid.

**Rewards:** the owner reward is split pro rata by share amount (floor for each share, remainder to the last) and
paid to each share's reward script in the coinbase.

**Not used in v1 of the dapp:** ProUpShareTx (type 11, reward script update), ProUpSharedRegTx (type 12, operator/voting
key rotation, unanimous), unanimous ProDisTx.

## 3. Roles and trust model

| Role | Does | Trusted for |
|---|---|---|
| **Pool creator** | Publishes the pool terms (optional starting service IP:port, operator BLS key, voting key, operator reward, early period/penalty), selects members, broadcasts the final tx, runs (or arranges) the node | Node operation and governance voting. Holds the operator and voting keys. **Cannot move member funds.** Rotating keys requires every member to sign. |
| **Member** | Joins with a share, then signs consent and funding in their wallet | Nothing. Can exit unilaterally at any time. |
| **Dapp** | Builds, displays and relays data | Nothing. Wallets decode and verify everything they sign. |
| **Platform** | Stores coordination documents | Availability only. Clients validate every document. |

The creator may also join their own pool as a member.

A reputation system (§11) ranks creators so members can prefer reliable ones.

Every member needs a Dash Platform identity (setup instructions are provided separately).

## 4. Data contract

Contract config:
- **not read-only**, so new document types can be added later.
- Every document type is **immutable** (`documentsMutable: false`) and **not deletable** (`canBeDeleted: false`).
- All history stays on Platform.

Rules that span documents (for example, "only the pool owner may lock") cannot be enforced by Platform.
**Every client validates on read** and ignores invalid documents (§5).

Encodings:
- `identifier` = 32-byte byteArray.
- Scripts are raw scriptPubKey bytes.
- Key IDs are 20-byte hash160.

Existing document types cannot gain indices or required fields later, so this schema must be right before the first deployment.
The contract itself is `schema.json` in the repo root.

**Testnet deployment (2026-10-02):** contract `5BrN2ssGNNAZPgA1wu8TCpdZr5Fb8BrQXpaHUVWJSr3z`, owned by identity
`9m1QYXVRyUpg99PyVD6DcdffuMhsJfgwLDxTeAg6PxDj`. `v2/scripts/test-contract.mjs` checks it on the network: one document
of every type, the unique indices, the enum and range limits, immutability, no deletion, and every query the app uses.
Registering the contract cost 0.424 DASH; a document costs about 0.00045 DASH.

Optional fields must be **left out** of a document, not set to null: Platform rejects null for a typed field.

### `pool` (owner: creator)
| Field | Type | Notes |
|---|---|---|
| `name` | string ≤ 63 | |
| `description` | string ≤ 1000 | |
| `service` | string ≤ 255, **optional** | Core P2P `ip:port` the masternode starts with. Informational after registration: the operator can change it at any time with a ProUpServTx signed by the operator key. Without it, the masternode registers PoSe-banned (ERROR) until the operator sets an address. |
| `location` | string enum, **optional** | ISO 3166-1 alpha-2 country code of where the node runs (250 codes, the enum in `v2/src/lib/countries.ts`). Informational only: nothing on chain enforces it. Set only for pools on a third-party operator's key, from that key; absent on such a pool means the key is worldwide. Custom-operator pools leave it out and clients show no location for them. |
| `operatorPubKey` | byteArray 48 | BLS (basic scheme) |
| `votingKeyId` | byteArray 20 | |
| `operatorReward` | integer 0–10000 | basis points |
| `earlyPeriodBlocks` | integer 0–420480 | |
| `earlyPenalty` | integer ≥ 0 | duffs. Zero is allowed; the UI warns. |
| `fee` | integer > 0 | duffs, total registration tx fee, split between members. Not chosen by the creator: the dapp writes a fixed value from its configuration (`VITE_REGISTRATION_FEE`, default 0.0002 DASH). It is stored so every client builds the same transaction whatever its own configuration. |

Indices: `$ownerId`, `$createdAt`, `operatorPubKey + $createdAt`.

The operator key index is **not unique**:
- A creator retrying after a stuck pool makes a new pool with the same operator key.
- A unique index would let anyone squat a key by publishing a pool with someone else's public key.

What makes a key unusable is the chain, not Platform: a ProRegTx is rejected when any masternode already holds the
key, under either BLS encoding (`bad-protx-dup-key`, `HasOperatorKeyUnderAnyScheme`). Clients use the index to:
- let an operator find every pool that uses their key;
- when creating a pool, reject a key that a masternode in the list already holds, and warn when other unregistered
  pools use it (only one of them can ever register);
- warn members on a pool page when its key is already taken, since such a pool can never register.

### `join` (owner: member)
| Field | Type | Notes |
|---|---|---|
| `poolId` | identifier | |
| `amount` | integer | duffs, 100–1000 DASH |
| `refundScript` | byteArray ≤ 64 | immutable refund destination (P2PKH/P2SH) |
| `rewardScript` | byteArray ≤ 64, optional | defaults to `refundScript` |
| `ownerKeyId` | byteArray 20 | share owner key, from the member's wallet |
| `inputs` | byteArray, multiple of 36, ≤ 32 inputs | concatenated outpoints: txid (32, internal byte order) + vout (uint32 LE) |
| `changeScript` | byteArray ≤ 64 | |
| `encryptionKeyId` | integer ≥ 0, **optional** | ID of the member's identity key the private chat key is encrypted to (§ Private chat). Without it the member can still join but cannot read the pool's private chat. |

Indices: **`poolId + $ownerId` unique** (one share per identity per pool), `poolId + $createdAt`, `$ownerId` (a member's joins across pools, for their dashboard).

### `lock` (owner: pool creator)
| Field | Type | Notes |
|---|---|---|
| `poolId` | identifier | |
| `joinIds` | byteArray, 64–256, multiple of 32 | concatenated join document IDs **in share order** |

Indices: **`poolId + $ownerId` unique**. The pool owner can therefore lock a pool only once.
**No re-locking:** to retry, the creator makes a new pool.

### `consent` (owner: member)
| Field | Type | Notes |
|---|---|---|
| `lockId` | identifier | |
| `signature` | byteArray 65 | compact signature over the consent hash |

Indices: `lockId + $ownerId`.

### `funding` (owner: member)
| Field | Type | Notes |
|---|---|---|
| `lockId` | identifier | |
| `scriptSigs` | byteArray | concatenated compact-size-prefixed scriptSigs, one per input of this member, in their input order |

Indices: `lockId + $ownerId`.

### `feedback` (owner: member)
| Field | Type | Notes |
|---|---|---|
| `poolId` | identifier | |
| `rating` | integer 1–5 | |
| `text` | string ≤ 1000 | |

Indices: `poolId + $createdAt`, `$ownerId`.

### `message` (owner: anyone)
Public chat, kept from v1: `channel` (`global` or a poolId) and `text`. Index `channel + $createdAt`.

### `chatKey` (owner: a selected member)
| Field | Type | Notes |
|---|---|---|
| `lockId` | identifier | |
| `envelopes` | byteArray, multiple of 94, ≤ 8 slots | the private chat's group key, wrapped once per participating member |

Indices: `lockId + $createdAt`.

### `privateMessage` (owner: a selected member)
| Field | Type | Notes |
|---|---|---|
| `lockId` | identifier | |
| `payload` | byteArray ≤ 4096 | nonce (12) + AES-256-GCM ciphertext + tag (16) |

Indices: `lockId + $createdAt`.

## 5. Client-side validation

A client ignores any document that fails these checks.

**Join**
- `poolId` exists.
- `amount` is between 100 and 1000 DASH.
- `ownerKeyId` is not null.
- Refund and reward scripts are P2PKH/P2SH.
- No script pays `pool.votingKeyId`.
- Inputs are non-empty and well-formed.

**Lock**, valid only if all of these hold:
- `$ownerId` equals the pool's `$ownerId`.
- It holds 2–8 distinct joins, all for this pool.
- Amounts sum to exactly 1000 DASH.
- `pool.earlyPenalty` < the smallest amount.
- Owner keys are unique, and refund scripts are unique.
- No refund or reward script pays any selected member's owner key or the voting key.
- Only the first lock by the pool owner counts, and the unique index guarantees there is at most one.

**Consent:** `$ownerId` is a member of the lock, and the signature recovers to that member's `ownerKeyId` over the consent hash.
Signatures must be canonical: header byte 27–34 and low-S.

**Funding:** `$ownerId` is a member of the lock, and each scriptSig validly signs the corresponding input of the combined tx (§6).

If a member publishes several `consent` or `funding` documents, any valid one is used.

Before offering a signing step, the client also checks that each member's inputs, with values fetched through DAPI,
cover `amount + feeShare`.

## 6. Deterministic registration transaction

Every client builds a byte-identical transaction from `pool`, `lock` and `join` documents plus the input values
from DAPI `getTransaction`. **Nobody trusts a posted transaction hex.** This logic goes into `dash-core-sdk`.

Let `n` be the number of shares, with member `i` = the i-th entry of `lock.joinIds`.

- **Header:** `nVersion = 3`, `nType = 1` (ProRegTx), `nLockTime = 0`.
- **Inputs:** for `i = 0..n-1`, each outpoint of `join[i].inputs` in the listed order. `scriptSig` is empty until
  funding, and `nSequence = 0xffffffff`.
- **Fee split:** `feeShare[i] = floor(pool.fee / n)` for every member except the last, which gets `pool.fee - (n-1)*floor(pool.fee / n)`.
- **Change:** `change[i] = Σ value(inputs of i) − amount[i] − feeShare[i]`.
  - It must be ≥ 0, otherwise the lock cannot be completed.
  - A change below Core's dust threshold is **omitted** and effectively added to the fee.
- **Outputs:**
  1. For `i = 0..n-1`, when present: `change[i]` to `join[i].changeScript`.
  2. Last: 1000 DASH to the template script `04445348437551`.
  - `collateralIndex = vout.length − 1`.
- **Payload** (CProRegTx):
  - `nVersion = 3`, `nType = 0` (Regular), `nMode = 0`, `collateralOutpoint = (null hash, collateralIndex)`.
  - `netInfo` from `pool.service` (ExtAddr encoding), or empty when the pool has no service address.
  - `keyIDOwner` = null, `pubKeyOperator = pool.operatorPubKey`, `keyIDVoting = pool.votingKeyId`, `nOperatorReward = pool.operatorReward`.
  - `payouts` = empty.
  - `shares[i] = {amount, refundScript, rewardScript or empty, ownerKeyId}` of `join[i]`.
  - `vchJoinSigs` = `n` × 65 zero bytes until consent is complete, then the consent signatures in share order.
  - `nEarlyPeriodBlocks`, `nEarlyPenalty` from the pool.
  - `inputsHash` = SHA256d of all input prevouts.
  - `vchSig` = empty.
- The txid of the fully signed tx is the **proTxHash**.

Order of signing:
1. The consent hash does not cover scriptSigs or `vchJoinSigs`, so **consent comes first**.
2. Once all `n` consent signatures are placed in the payload, the tx bytes are final except for scriptSigs.
3. **Funding signatures come second.** They use SIGHASH_ALL, which covers the payload including the join signatures.

## 7. Signature digests

Both digests are **double SHA-256** over the Dash serialization of the fields below:
- integers are little-endian
- strings, scripts and vectors are compact-size length-prefixed
- uint256 values are 32 raw bytes

Signatures are 65-byte compact recoverable ECDSA over the raw 32-byte digest, **with no message prefix**.
Verification recovers the public key and compares its hash160 to the key ID.

**Consent hash** (`CProRegTx::MakeSharedRegConsentHash`, `providertx.cpp:338`):

```
"DashSharedMNReg" (string)
payload.nVersion      uint16
tx.nVersion           int16
tx.nType              uint16
tx.nLockTime          uint32
SHA256d(concat prevouts)          32
nSequence of every input          uint32 each
SHA256d(concat serialized outputs) 32
payload.nType, payload.nMode      uint16, uint16
netInfo                           (payload encoding)
keyIDVoting                       20
pubKeyOperator                    48 (basic scheme)
nOperatorReward                   uint16
shares.size()                     uint8
each share: amount int64, scriptRefund, scriptReward, keyIDOwner(20)
nEarlyPeriodBlocks                uint32
nEarlyPenalty                     int64
```

**Dissolution sign hash** (`CProDisTx::MakeSignHash`, `providertx.cpp:506`):

```
"DashSharedMNDissolve" (string)
payload.nVersion uint16, tx.nVersion int16, tx.nType uint16, tx.nLockTime uint32
each input prevout (32 + uint32), then each input nSequence
each output (int64 value + script)
proTxHash 32, actorIndex uint16, sigCount uint8   (1 = unilateral, n = unanimous)
```

The `dash-core-sdk` implementation must be tested byte-for-byte against `protx shared_register_prepare` (`consentHash`) on
regtest/devnet.

## 8. Flow

1. **Create pool.** The creator publishes `pool`, with the registration fee fixed by the dapp configuration. The UI
   warns when `earlyPenalty = 0` ("any participant can force an early exit at no cost beyond the fee").
2. **Join.** Using their wallet, a member supplies:
   - an owner key ID (a new key, derived from the wallet seed)
   - a refund script, and optionally a reward script
   - UTXOs covering `amount + feeShare`
   - a change script

   Then they publish `join`. Joins are final: a member cannot change or withdraw theirs.
3. **Lock.** The creator selects 2–8 joins totalling exactly 1000 DASH, orders them, and publishes `lock`.
   The creator may skip members on a personal ban list.
4. **Consent.**
   - Each member's client builds the tx (§6) and sends a `sharedmn-consent` request to the wallet.
   - The wallet shows the decoded terms and signs.
   - The member publishes `consent`.
5. **Fund.**
   - Once every consent is valid, each client inserts the join signatures and sends a `sharedmn-fund` request.
   - The wallet signs only its own inputs.
   - The member publishes `funding`.
6. **Broadcast.**
   - Once every funding is valid, the creator (or anyone) combines the scriptSigs and calls DAPI `broadcastTransaction`.
   - If an input was spent in the meantime, the broadcast is rejected and the pool stays SIGNING. The creator can start a new pool.
7. **Operate.** Core pays owner rewards directly to each share's reward script.
8. **Exit.** Any member can dissolve unilaterally with `sharedmn-dissolve` (§10).

## 9. Pool status (derived, never stored)

Checks run in order, and the first match wins.

| Status | Condition | Source |
|---|---|---|
| **NEW** | no valid `lock` by the pool owner | Platform |
| **SIGNING** | lock exists, and a valid `consent` or `funding` is missing from some member, **or** everything is present but `getTransaction(txid)` returns not found or not yet in a block | Platform + DAPI |
| **FORMED** | tx is in a block and the proTxHash is in the masternode list with `isValid = true` | DAPI `subscribeToMasternodeList` |
| **ERROR** | tx is in a block and the proTxHash is in the list with `isValid = false` (PoSe-banned or revoked). Can return to FORMED after the operator's ProUpServTx. A pool registered without a service address starts here. | DAPI |
| **DISSOLVED** | tx is in a block but the proTxHash is no longer in the list (only a ProDisTx can spend a shared collateral) | DAPI |

- The **all-pools page** shows only **NEW / LOCKED**, from Platform queries alone.
- The **details page** resolves SIGNING, FORMED, ERROR and DISSOLVED.
- Assumption: DAPI nodes run Core with `txindex=1`, so `getTransaction` works for any txid. Verify on testnet.

### Service address and operator payout

- **The operator key, not the IP, is what members trust.** A ProUpServTx is signed by the operator BLS key alone;
  share owners take no part. It changes the service address, sets the operator payout address, and revives a
  PoSe-banned masternode (shared masternodes included).
- Once a pool is FORMED or ERROR, clients show the **live address from the masternode list** and flag it when it
  differs from the pool document.
- A registration with a service address fails if another masternode already uses it (`bad-protx-dup-netinfo-entry`).
  The address is covered by the consent hash, so the pool stays SIGNING.
- The operator's cut is paid only once the operator sets a payout address with a ProUpServTx
  (`protx update_service <proTxHash> <ip:port> <operatorKey> <operatorPayoutAddress> <feeSourceAddress>`).
  Until then, members receive the whole owner reward. For a shared masternode `feeSourceAddress` must be given
  explicitly; otherwise Core falls back to the first share's reward address, which the operator can't spend.

### Third-party operators

A creator who doesn't run a node can pick a third-party operator instead of entering their own operator key.
The dapp ships a list of operators and their ready BLS public keys (`v2/src/operators.ts`; currently pshenmic.dev).

- Keys are shown as operator IDs: the first 8 hex characters of the key.
- The form checks every key against the masternode list and the `operatorPubKey` index. Keys held by a masternode
  or used by another pool can't be picked.
- The pool registers **without a service address**; the operator sets it (and their payout address) with a
  ProUpServTx. The masternode shows ERROR until then.
- The operator reward is paid to the payout address the operator sets, so it is the operator's fee, not the
  creator's. Each listed key carries the operator's fee, and a pool using that key takes it as `operatorReward`;
  only a custom operator sets their own.
- Each listed key also carries the operator's voting address: the operator votes for masternodes on their keys, and
  a pool using the key takes that address as `votingKeyId`. Only a custom operator sets their own.
- Pool pages name the operator when the pool's key belongs to a listed operator.

### Private chat

Each pool has two chats: the public one (`message` documents) and a private, encrypted one for the members who hold
a share.

- **Who is in it.** The members selected in the lock who joined with an `encryptionKeyId`. The pool creator is **not**
  part of it unless they are also a selected member. A member who joined without a key can never read it for that
  pool, because joins are immutable.
- **When it opens.** At the lock. Before that anyone can join, so there is no closed group to encrypt to.
- **Member keys.** `encryptionKeyId` names an enabled ECDSA_SECP256K1 key on the member's identity with the ENCRYPTION
  or DECRYPTION purpose. Its public key is on Platform, so anyone can encrypt to it.
- **Group key.** One random 256-bit key per pool. A participating member's client generates it and publishes a
  `chatKey` document holding one envelope per participant. The creator must not generate it: whoever generates the
  key knows it.
- **Envelope** (94 bytes): `shareIndex (1) || ephemeral public key (33) || nonce (12) || wrapped key (32) || tag (16)`.
  Wrapping is ECIES: ECDH between a throwaway key and the member's public key, then HKDF-SHA256 with info
  `dash-trustless-staking/private-chat/v1`, then AES-256-GCM. It needs only public keys, so it causes no wallet
  prompt.
- **Which key document counts.** The oldest `chatKey` for the lock that a participant published, is well-formed, and
  has envelopes only for participants. Later ones are ignored, so everyone uses the same key. The group is fixed (no
  re-locking), so the key never rotates.
- **Unwrapping** is the one step that uses a private key. With a private-key login the dapp unwraps the envelope
  with the identity's encryption key; with the extension it will call the extension's `decrypt` method. The dapp
  keeps the group key in memory for the page's lifetime only.
- **Messages.** `privateMessage.payload = nonce (12) || AES-256-GCM(group key, UTF-8 text) || tag (16)`, encrypted and
  decrypted in the dapp. Clients show only messages from selected members that decrypt under the group key.

Limits:
- Metadata is public: who posted, when, in which pool, and roughly how long the message was.
- No forward secrecy and no deletion: if the group key or a member's key ever leaks, the whole history is readable.
- Any member can copy messages out.
- A participant who starts the chat with a bad envelope for someone locks that member out. Only members can do this.

## 10. Wallet interface

There is **no wallet integration** for these signatures. The dapp shows what to sign (the transaction hex, plus the
equivalent Dash Core command), and the user signs in their wallet of choice and types or pastes the result into the
dapp. The dapp validates it before publishing: the signature recovers to the member's owner key, or the scriptSigs
verify.
**The wallet decides what it signs:** it decodes the transaction itself and shows the terms, its own share, its refund
destination and the fee. The dapp is untrusted UI.

Platform documents are a separate matter: they are created and signed through **dash-platform-extension**
(`connect()` / `signAndBroadcast()`). Login by QR code is planned for later.

Responses use the same format as Dash Core RPC output, so Dash Core stays a working fallback signer.

| `type` | Request | Wallet does | Response | Core equivalent |
|---|---|---|---|---|
| `sharedmn-consent` | unsigned regtx hex | decode it; find the share whose `keyIDOwner` it holds; show the terms; compute the consent hash; sign | `{shareIndex, signature}` (base64) | `protx shared_sign <hex>` |
| `sharedmn-fund` | regtx hex with all join signatures | check the consent hash equals the one it signed; sign only its own inputs, SIGHASH_ALL | partially signed tx hex | `signrawtransactionwithwallet` |
| `sharedmn-dissolve` (unilateral) | proTxHash, shareIndex, fee | read the share table from chain; build the ProDisTx; show refunds and penalty; sign with the owner key | signed tx hex (or broadcast) | `protx shared_dissolve <proTxHash> <idx> <fee> false` |

**Unilateral ProDisTx construction:**
- One input: the collateral outpoint `(proTxHash, collateralIndex)`, empty scriptSig.
- Outputs: for each non-actor share in share order, `amount + bonus` to its refund script, where
  `bonus ≥ floor(P × amount / Σ non-actor amounts)`, `Σ bonus ≥ P` and `Σ bonus ≤ nEarlyPenalty`.
  Here `P = nEarlyPenalty` inside the early period and 0 after it.
- The last output is the actor's remainder to its own refund script, omitted if zero.
- The fee is ≤ 1,000,000 duffs.

Wallets should **derive share owner keys from the seed** on a dedicated path. A mnemonic backup then covers them, and a
pre-signed "standby" dissolution is unnecessary because the wallet can always rebuild the ProDisTx.

## 11. Reputation (v1)

Computed client-side from Platform and DAPI only, with no history store. Per creator:
- the number of pools that reached FORMED, versus pools stuck in SIGNING, versus pools DISSOLVED early
- current `isValid` of their FORMED masternodes
- lock responsiveness: time from the pool's joins first reaching 1000 DASH to the `lock` `$createdAt`
- `feedback` ratings. These count only when the author's join is part of that pool's lock and the pool reached FORMED.

Uptime history and PoSe score trends need data DAPI doesn't provide (see §13).

## 12. DAPI usage

| Need | DAPI call |
|---|---|
| Input values/scripts | `getTransaction` of each input's funding tx |
| Broadcast | `broadcastTransaction` |
| Registration confirmation | `getTransaction(proTxHash)` (height / chainlock) |
| FORMED / ERROR / DISSOLVED | `subscribeToMasternodeList` (simplified masternode list: `isValid`, no PoSe score, no share table) |
| Tip height (early-period math) | `getBestBlockHeight` |

## 13. Future work

- **Unanimous dissolution:** new `dissolve_proposal` and `dissolve_signature` document types. The `sharedmn-dissolve` request gains a unanimous mode.
- **Share reward updates** (ProUpShareTx) and **registrar updates** (ProUpSharedRegTx), with their wallet request types.
- An optional `registration` index document (poolId, proTxHash), if deriving FORMED for many pools becomes slow.
- A DAPI endpoint for a masternode's full state (PoSe score) by proTxHash, which would enable earlier ERROR warnings.
- Uptime history for reputation.

## 14. `dash-core-sdk` additions

- ProRegTx payload version 3: netInfo (ExtAddr), payouts, share table, `vchJoinSigs`, early period/penalty.
- Special tx types 10 (ProDisTx), 11 (ProUpShareTx) and 12 (ProUpSharedRegTx): serialization. Only type 10 is needed for v1.
- `consentHash(tx)` and `dissolveSignHash(tx, sigCount)` (§7).
- Canonical compact signature sign/verify over a raw hash.
- The shared collateral template script constant.
- The deterministic registration builder (§6) and the unilateral ProDisTx builder (§10).
