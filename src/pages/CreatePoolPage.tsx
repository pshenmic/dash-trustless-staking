import { Input, ProgressStepBar, Textarea } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Chip, Field, KeyValue, KeyValueList, Notice, PageHeader, Card } from '../components/ui'
import { errorMessage, useToast } from '../components/Toast'
import { backend, platformFor } from '../data'
import { randomBase58, randomHex, seededRandom } from '../data/mock/mockHash'
import { useHostingOptions, useWrite } from '../hooks/data'
import { buildHostingProvider, HOSTING_VOTING_ADDRESS } from '../hosting'
import { COLLATERAL, MAX_ENTRY_FEE, MAX_EARLY_PERIOD_BLOCKS, MAX_SHARES, MIN_SHARES } from '../lib/consensus'
import { blocksToDuration, formatBasisPoints, formatDash, parseDash } from '../lib/format'
import { poolDisplayName } from '../lib/poolName'
import { memberFeeShares, isBlsPublicKey, validatePoolTerms, type PoolTermsInput } from '../lib/rules'
import type { FeePayer } from '../lib/types'
import { fetchOperatorKeyUsage } from '../data/queries'
import { OperatorKeyNotice } from '../components/pool/OperatorKeyNotice'
import { useNetwork } from '../lib/network'
import { useWallet } from '../wallet/WalletContext'
import { config } from '../config'
import { OperatorKeyPicker } from '../components/OperatorKeyPicker'
import { OPERATOR_PROVIDERS, operatorId } from '../operators'
import { defaultGeneration, generationBySlug, poolSupports, useGeneration } from '../generations'

const STEPS = ['Node', 'Exit terms', 'Review'] as const

const PERIODS = [
  { label: 'None', blocks: 0 },
  { label: '2 weeks', blocks: 8_064 },
  { label: '30 days', blocks: 17_280 },
  { label: '60 days', blocks: 34_560 },
  { label: '90 days', blocks: 51_840 },
  { label: '1 year', blocks: 210_240 }
]

/** Which fields each step owns, for per-step validation */
const STEP_FIELDS: Array<Array<keyof PoolTermsInput>> = [
  ['operatorPubKey', 'service', 'votingAddress', 'operatorReward'],
  ['earlyPeriodBlocks', 'earlyPenalty', 'fee', 'feePayer', 'entryFee', 'entryFeeAddress'],
  []
]

const DRAFT_KEY = 'dts:pool-draft:v2'

interface Draft {
  form: Record<string, string>
  step: number
  operatorSource: string
  touched: boolean[]
  savedAt: number
}

function readDraft (): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw == null) return null
    const draft = JSON.parse(raw) as Draft
    // Age out drafts older than 24 hours so stale terms don't surprise anyone
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) { localStorage.removeItem(DRAFT_KEY); return null }
    return draft
  } catch { return null }
}

function saveDraft (draft: Omit<Draft, 'savedAt'>): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })) } catch { /* quota exceeded */ }
}

function clearDraft (): void {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignored */ }
}

export function CreatePoolPage (): ReactNode {
  const navigate = useNavigate()
  const { activeIdentity, openLogin } = useWallet()
  const activeIdentityRef = useRef(activeIdentity)
  activeIdentityRef.current = activeIdentity
  const { network, strict } = useNetwork()
  const { ref } = useGeneration()
  // The generation's own schema decides which optional pool fields exist and which ones are required
  const supportsService = poolSupports(ref, 'service')
  // The schema declares the entry fee, but only a contract that actually carries it accepts the write
  const supportsEntryFee = ref.entryFee
  const { notify } = useToast()
  const draft = readDraft()
  const [step, setStep] = useState(draft?.step ?? 0)
  const [touched, setTouched] = useState<boolean[]>(draft?.touched ?? STEPS.map(() => false))
  // 'custom' = the creator runs the node; otherwise a third-party operator from src/operators.ts
  const [operatorSource, setOperatorSource] = useState(draft?.operatorSource ?? 'custom')
  // Live hosting comes from pshenmic.dev's Platform contract; the mock sandbox keeps its preview keys
  const hosting = useHostingOptions()
  const hostingProvider = buildHostingProvider(hosting.data?.terms ?? null, hosting.data?.servers ?? [])
  const providers = backend.mode === 'mock' ? OPERATOR_PROVIDERS : [hostingProvider]
  const provider = providers.find(p => p.id === operatorSource) ?? null
  const [form, setForm] = useState(() => ({
    service: '', operatorPubKey: '', votingAddress: '',
    operatorReward: '5', earlyPeriodBlocks: '17280', earlyPenalty: '5', fee: '', feePayer: 'creator',
    entryFee: '', entryFeeAddress: '',
    allowVoting: 'true',
    // Old drafts predate the fee fields; keep their values and fill the new ones with defaults
    ...(draft?.form ?? {})
  }))
  const selectedKey = provider?.keys.find(key => key.pubKey.toLowerCase() === form.operatorPubKey.trim().toLowerCase()) ?? null

  // The name and description are promotional and set after creation through poolMeta, so the pool
  // document is published without them; a generation that still declares them keeps them optional
  const terms: PoolTermsInput = {
    // A third-party operator sets the address after registration, so the ProRegTx carries none
    service: provider != null ? '' : form.service.trim(),
    operatorPubKey: form.operatorPubKey.trim().toLowerCase(),
    // A third-party operator votes with their own key for the chosen operator key; a custom operator
    // either uses the shared voting address (members vote in the app) or their own
    votingAddress: provider != null
      ? selectedKey?.votingAddress ?? ''
      : form.allowVoting === 'false' ? form.votingAddress.trim() : HOSTING_VOTING_ADDRESS,
    // A third-party operator's key fixes the fee; only a custom operator sets their own
    operatorReward: provider != null ? selectedKey?.operatorReward ?? NaN : Math.round(Number(form.operatorReward) * 100),
    earlyPeriodBlocks: form.earlyPeriodBlocks.trim() === '' ? NaN : Number(form.earlyPeriodBlocks),
    earlyPenalty: parseDash(form.earlyPenalty) ?? NaN,
    // Blank keeps the app default; the pool document stores the resolved amount
    fee: form.fee.trim() === '' ? config.registrationFee : parseDash(form.fee) ?? NaN,
    feePayer: form.feePayer as FeePayer,
    // Blank means the pool charges no entry fee at all
    entryFee: form.entryFee.trim() === '' ? 0 : parseDash(form.entryFee) ?? NaN,
    entryFeeAddress: form.entryFeeAddress.trim()
  }
  if (provider == null && (form.operatorReward.trim() === '' || !Number.isFinite(Number(form.operatorReward)))) terms.operatorReward = NaN
  const errors = validatePoolTerms(terms, network, strict)
  // The shared voting address is system-provided, not user input: no shape check while the box is ticked
  if (provider == null && form.allowVoting !== 'false') delete errors.votingAddress
  // Fields this generation's contract does not have (or does not require) must not block publishing
  if (!supportsService) delete errors.service
  if (!supportsEntryFee) {
    delete errors.entryFee
    delete errors.entryFeeAddress
  }

  // A key a masternode already holds would make the registration fail; other pools only get a warning
  const keyUsage = useQuery({
    queryKey: ['operator-key', terms.operatorPubKey],
    queryFn: async () => await fetchOperatorKeyUsage(terms.operatorPubKey),
    enabled: isBlsPublicKey(terms.operatorPubKey)
  })
  if (errors.operatorPubKey == null && keyUsage.data?.masternode != null) {
    errors.operatorPubKey = 'A masternode already uses this operator key'
  }
  if (provider != null && terms.operatorPubKey === '') {
    errors.operatorPubKey = `Choose one of ${provider.name}’s operator keys`
    delete errors.operatorReward
    delete errors.votingAddress
  }

  const chooseSource = (source: string): void => {
    setOperatorSource(source)
    setForm(f => ({ ...f, operatorPubKey: '', service: '' }))
  }
  const stepValid = (i: number): boolean => STEP_FIELDS[i]
    .filter(f => f !== 'service' || supportsService)
    .every(f => errors[f] == null)
  const show = (field: keyof PoolTermsInput): string | null => {
    if (!touched[step]) return null
    const error = errors[field]
    if (error == null) return null
    const value = terms[field]
    if (typeof value === 'string' && value.trim() === '') return null
    if (typeof value === 'number' && Number.isNaN(value)) return null
    return error
  }
  const set = (field: keyof typeof form) => (value: string) => setForm(f => ({ ...f, [field]: value }))

  // Persist the form as a draft so a restart or extension installation doesn't lose it
  useEffect(() => {
    if (form.operatorPubKey.trim() !== '' || form.service.trim() !== '') {
      saveDraft({ form, step, operatorSource, touched })
    }
  }, [form, step, operatorSource, touched])

  // Recreating an existing pool on this generation: ?from=<poolId>&gen=<slug> copies its terms once
  const [params] = useSearchParams()
  const fromPoolId = params.get('from')
  const fromGeneration = generationBySlug(params.get('gen') ?? undefined)
  const originPool = useQuery({
    queryKey: ['recreate-source', fromGeneration?.slug ?? '', fromPoolId],
    queryFn: async () => await platformFor(fromGeneration ?? defaultGeneration).getPool(fromPoolId as string),
    enabled: fromPoolId != null
  })
  const prefilled = useRef(false)
  useEffect(() => {
    const source = originPool.data
    if (source == null || prefilled.current) return
    prefilled.current = true
    setOperatorSource('custom')
    setForm(f => ({
      ...f,
      operatorPubKey: source.operatorPubKey,
      operatorReward: String(source.operatorReward / 100),
      earlyPeriodBlocks: String(source.earlyPeriodBlocks),
      earlyPenalty: String(source.earlyPenalty / 1e8),
      fee: String(source.fee / 1e8),
      feePayer: source.feePayer ?? 'creator',
      allowVoting: source.votingAddress === HOSTING_VOTING_ADDRESS ? 'true' : 'false',
      votingAddress: source.votingAddress === HOSTING_VOTING_ADDRESS ? '' : source.votingAddress,
      ...(source.entryFee != null && source.entryFee > 0
        ? { entryFee: String(source.entryFee / 1e8), entryFeeAddress: source.entryFeeAddress ?? '' }
        : {})
    }))
  }, [originPool.data])

  const next = (): void => {
    setTouched(t => t.map((v, i) => i === step ? true : v))
    if (stepValid(step)) setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  const create = useWrite(async () => {
    const identity = activeIdentityRef.current
    if (identity == null) throw new Error('Connect your identity first')
    // Optional contract fields are left out rather than stored empty, and fields the generation's
    // schema does not declare are never sent (Platform would reject the document)
    const { service, entryFee, entryFeeAddress, ...rest } = terms
    return await backend.platform.createPool(identity, {
      ...rest,
      ...(supportsService && service !== '' ? { service } : {}),
      ...(supportsEntryFee && entryFee != null && entryFee > 0 ? { entryFee, entryFeeAddress } : {})
    })
  })

  const publish = (): void => {
    create.mutate(undefined, {
      onSuccess: pool => {
        console.log('pool created:', pool.id)
        clearDraft()
        notify('Pool created')
        void navigate(`/pools/${pool.id}`)
      },
      onError: e => {
        console.error('publish failed:', e)
        notify(errorMessage(e), 'error')
      }
    })
  }

  const fillMockNode = (): void => {
    const random = seededRandom(Date.now() % 2 ** 31)
    setForm(f => ({
      ...f,
      service: `${Math.floor(random() * 200) + 20}.${Math.floor(random() * 250)}.${Math.floor(random() * 250)}.${Math.floor(random() * 250) + 1}:19999`,
      operatorPubKey: randomHex(random, 48),
      votingAddress: randomBase58(random, 34, 'y')
    }))
  }

  const penaltyExample = Number.isFinite(terms.earlyPenalty) && terms.earlyPenalty > 0

  return (
    <div className='mx-auto max-w-2xl'>
      {fromPoolId != null && originPool.data != null && (
        <Notice tone='info' title={`Copied the terms of ${poolDisplayName(originPool.data)}`}>
          Adjust anything before publishing. The original pool keeps running on {fromGeneration?.label ?? 'its own version'};
          this creates a new one on {defaultGeneration.label}.
        </Notice>
      )}

      <PageHeader
        title='Create a pool'
        subtitle='You publish the masternode terms. Members join, you pick who is in, and everyone signs. You run the node; you never hold anyone’s coins.'
      />

      {draft != null && <div className='mb-4 text-small text-muted'>⏺ Draft saved — a refresh won't lose your progress</div>}

      <div className='mb-6'>
        <div className='mb-2 flex justify-between text-small'>
          <span className='font-bold'>{STEPS[step]}</span>
          <span className='text-muted'>Step {step + 1} of {STEPS.length}</span>
        </div>
        <ProgressStepBar currentStep={step + 1} totalSteps={STEPS.length} />
      </div>

      <Card className='flex flex-col gap-5'>
        {step === 0 && (
          <>
            <Field label='Operator' hint={provider?.description ?? 'You run the node yourself and hold its operator key.'}>
              <div className='flex flex-wrap gap-2'>
                {providers.map(p => (
                  <Chip key={p.id} active={operatorSource === p.id} onClick={() => chooseSource(p.id)}>{p.name}</Chip>
                ))}
                <Chip active={provider == null} onClick={() => chooseSource('custom')}>Custom</Chip>
              </div>
            </Field>

            {provider == null
              ? (
                <>
                  <Field label='Operator BLS public key' error={show('operatorPubKey')} hint='From bls generate on your node. Keep the secret key on the server.' htmlFor='pool-operator'>
                    <Textarea id='pool-operator' rows={2} showPasteButton={false} font='grotesque' value={form.operatorPubKey} onChange={set('operatorPubKey')} placeholder='96 hex characters' />
                  </Field>
                  {keyUsage.data != null && <OperatorKeyNotice usage={keyUsage.data} creating />}
                  <Notice tone='info'>
                    You run this node, so you hold the operator key{form.allowVoting === 'false' ? ' and the voting key' : '; the voting key is held by the shared voting service'}. The operator key also controls
                    the node’s address and your payout address. Members can’t change either key without everyone
                    signing, and neither key can move anyone’s coins.
                  </Notice>
                  {supportsService && (
                    <Field
                      label='Masternode IP:PORT'
                      optional
                      error={show('service')}
                      hint='Where the node starts. You can change it any time with your operator key (protx update_service). Leave it empty if the server isn’t ready: the node registers inactive until you set it.'
                      htmlFor='pool-service'
                    >
                      <Input id='pool-service' value={form.service} onChange={e => set('service')(e.target.value)} placeholder='203.0.113.10:9999' spellCheck={false} />
                    </Field>
                  )}
                  <label className='flex items-start gap-3 text-small'>
                    <input
                      type='checkbox'
                      className='mt-1'
                      checked={form.allowVoting !== 'false'}
                      onChange={e => set('allowVoting')(e.target.checked ? 'true' : 'false')}
                    />
                    <span>
                      <span className='font-bold'>Allow members to vote</span>
                      <span className='block text-tag text-muted'>Use the shared voting address so members can record governance choices in the app. With your own voting address, the pool can’t take part in shared voting.</span>
                    </span>
                  </label>
                  {form.allowVoting === 'false' && (
                    <Field label='Voting address' error={show('votingAddress')} hint='A P2PKH address whose key votes on governance proposals' htmlFor='pool-voting'>
                      <Input id='pool-voting' value={form.votingAddress} onChange={e => set('votingAddress')(e.target.value)} placeholder='y…' spellCheck={false} />
                    </Field>
                  )}
                  <Field label='Operator fee' error={show('operatorReward')} hint='Your cut of each masternode reward, before members are paid' htmlFor='pool-reward'>
                    <Input id='pool-reward' inputMode='decimal' value={form.operatorReward} onChange={e => set('operatorReward')(e.target.value)} prefix='%' />
                  </Field>
                </>
                )
              : (
                <>
                  {backend.mode === 'live' && hosting.isLoading && <Notice tone='info'>Loading available servers…</Notice>}
                  {backend.mode === 'live' && hosting.isError && (
                    <Notice tone='error' title='Could not load pshenmic.dev hosting'>{errorMessage(hosting.error)}</Notice>
                  )}
                  {backend.mode === 'live' && !hosting.isLoading && !hosting.isError && hosting.data?.terms == null && (
                    <Notice tone='error' title='pshenmic.dev hosting unavailable'>The hosting terms are not published yet.</Notice>
                  )}
                  {provider.keys.length > 0 && (
                    <Field label='Operator ID' error={show('operatorPubKey')} hint='Each ID is one of the operator’s keys. A key can back only one masternode, so keys already used by a masternode or another pool can’t be picked.'>
                      <OperatorKeyPicker provider={provider} value={form.operatorPubKey} onChange={set('operatorPubKey')} />
                    </Field>
                  )}
                  {backend.mode === 'live' && !hosting.isLoading && !hosting.isError && hosting.data?.terms != null && provider.keys.length === 0 && (
                    <Notice tone='info'>No pshenmic.dev servers are available right now.</Notice>
                  )}
                  <Notice tone='info'>
                    {provider.name} runs this node and holds its operator and voting keys. The chosen key sets the
                    operator fee; {provider.name} sets the node’s address after registration, and the node is
                    inactive until then. Replacing either key takes every member’s signature, and neither key can
                    move anyone’s coins.
                  </Notice>
                </>
                )}

            {backend.mode === 'mock' && provider == null && (
              <button type='button' onClick={fillMockNode} className='self-start text-small font-bold text-brand-ink hover:underline'>Fill with mock data</button>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <p className='text-small text-muted'>
              Any member can dissolve the masternode on their own at any time. During the early period, whoever does
              pays a penalty to the other members. This protects everyone from a member who leaves right after
              registration.
            </p>
            <Field label='Early period' error={show('earlyPeriodBlocks')} hint={`Up to ${blocksToDuration(MAX_EARLY_PERIOD_BLOCKS)}`}>
              <div className='flex flex-wrap gap-2'>
                {PERIODS.map(p => (
                  <Chip
                    key={p.blocks}
                    active={terms.earlyPeriodBlocks === p.blocks}
                    onClick={() => setForm(f => ({ ...f, earlyPeriodBlocks: String(p.blocks), earlyPenalty: p.blocks === 0 ? '0' : f.earlyPenalty }))}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              <Input value={form.earlyPeriodBlocks} inputMode='numeric' onChange={e => set('earlyPeriodBlocks')(e.target.value)} prefix='blocks' aria-label='Early period in blocks' />
            </Field>
            <Field label='Early exit penalty' error={show('earlyPenalty')} hint='Below the smallest share. 0 means members can leave early for free.' htmlFor='pool-penalty'>
              <Input id='pool-penalty' inputMode='decimal' value={form.earlyPenalty} onChange={e => set('earlyPenalty')(e.target.value)} prefix='DASH' disabled={terms.earlyPeriodBlocks === 0} />
            </Field>
            <Field label='Registration fee' error={show('fee')} hint={`Optional. Leave it blank for ${formatDash(config.registrationFee)}. This is a network fee, separate from the operator fee.`} htmlFor='pool-fee'>
              <Input id='pool-fee' inputMode='decimal' value={form.fee} onChange={e => set('fee')(e.target.value)} prefix='DASH' placeholder={formatDash(config.registrationFee)} />
            </Field>
            <Field label='Who pays the registration fee' error={show('feePayer')}>
              <div className='flex flex-wrap gap-2'>
                <Chip active={form.feePayer === 'members'} onClick={() => set('feePayer')('members')}>Split between members</Chip>
                <Chip active={form.feePayer === 'creator'} onClick={() => set('feePayer')('creator')}>Pool creator</Chip>
              </div>
            </Field>
            {form.feePayer === 'creator' && (
              <Notice tone='info' title='You pay the registration fee'>
                You will commit a fee UTXO when you lock the pool. You do not need to take a share.
              </Notice>
            )}
            {supportsEntryFee && (
              <>
                <Field
                  label='Entry fee'
                  error={show('entryFee')}
                  hint={`Optional, per member. Paid to you once, when the pool registers. At most ${formatDash(MAX_ENTRY_FEE)} per member, so eight members never exceed 100 DASH.`}
                  htmlFor='pool-entry-fee'
                >
                  <Input id='pool-entry-fee' inputMode='decimal' value={form.entryFee} onChange={e => set('entryFee')(e.target.value)} prefix='DASH' placeholder='0' />
                </Field>
                {terms.entryFee != null && Number.isFinite(terms.entryFee) && terms.entryFee > 0 && (
                  <>
                    <Field
                      label='Payout address'
                      error={show('entryFeeAddress')}
                      hint='Receives the entry fees. It must be an address whose key you control.'
                      htmlFor='pool-entry-fee-address'
                    >
                      <Input id='pool-entry-fee-address' value={form.entryFeeAddress} onChange={e => set('entryFeeAddress')(e.target.value)} placeholder={network === 'mainnet' ? 'X…' : 'y…'} />
                    </Field>
                    <Notice tone='info' title='Entry fee'>
                      Every share pays {formatDash(terms.entryFee)} on top of its amount, including your own if you take one.
                      {' '}With {MAX_SHARES} members you receive {formatDash(terms.entryFee * MAX_SHARES)}; with {MIN_SHARES}, {formatDash(terms.entryFee * MIN_SHARES)}.
                    </Notice>
                  </>
                )}
              </>
            )}
            {terms.earlyPenalty === 0 && (
              <Notice tone='warning' title='No penalty'>Any member will be able to force an early exit at no cost beyond the transaction fee.</Notice>
            )}
            {penaltyExample && Number.isFinite(terms.earlyPeriodBlocks) && terms.earlyPeriodBlocks > 0 && (
              <Notice tone='info' title='Example'>
                In a pool of four 250 DASH members, one who leaves in the first {blocksToDuration(terms.earlyPeriodBlocks)} gets back {formatDash(250 * 1e8 - terms.earlyPenalty)} (minus the network fee); the other three each get about {formatDash(250 * 1e8 + Math.floor(terms.earlyPenalty / 3))}.
              </Notice>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Notice tone='warning' title='Terms are permanent'>Once published, these terms can never change. To change anything, create a new pool.</Notice>
            <KeyValueList>
              <KeyValue label='Operator'>
                {provider != null
                  ? <>{provider.name} <span className='font-mono font-medium text-muted'>· {operatorId(terms.operatorPubKey)}</span></>
                  : 'You (custom)'}
              </KeyValue>
              <KeyValue label='Operator key'><span className='font-mono text-[12px] break-all'>{terms.operatorPubKey}</span></KeyValue>
              {supportsService && (
                <KeyValue label='Masternode IP:PORT'>
                  {terms.service !== '' ? <span className='font-mono'>{terms.service}</span> : provider != null ? `Set by ${provider.name} after registration` : 'Set after registration'}
                </KeyValue>
              )}
              <KeyValue
                label='Voting address'
                hint={provider == null && form.allowVoting !== 'false' ? 'Shared voting address — members record governance choices in the app' : undefined}
              >
                <span className='font-mono text-small break-all'>{terms.votingAddress}</span>
              </KeyValue>
              <KeyValue label='Operator fee'>{formatBasisPoints(terms.operatorReward)}</KeyValue>
              <KeyValue
                label='Registration fee'
                hint={terms.feePayer === 'creator'
                  ? 'Paid by you (the pool creator) from a fee input at lock'
                  : `Split between members: ${formatDash(memberFeeShares(terms.fee, MAX_SHARES, 'members')[0])} each with ${MAX_SHARES}, up to ${formatDash(memberFeeShares(terms.fee, MIN_SHARES, 'members')[1])} with ${MIN_SHARES}`}
              >
                {formatDash(terms.fee)}
              </KeyValue>
              <KeyValue label='Early period'>{terms.earlyPeriodBlocks === 0 ? 'None' : `${blocksToDuration(terms.earlyPeriodBlocks)} (${terms.earlyPeriodBlocks.toLocaleString('en-US')} blocks)`}</KeyValue>
              <KeyValue label='Early exit penalty'>{terms.earlyPenalty === 0 ? 'None' : formatDash(terms.earlyPenalty)}</KeyValue>
              <KeyValue label='Collateral'>{formatDash(COLLATERAL)} from {MIN_SHARES}–{MAX_SHARES} members</KeyValue>
            </KeyValueList>
            {keyUsage.data != null && keyUsage.data.masternode == null && <OperatorKeyNotice usage={keyUsage.data} creating />}
            {Object.keys(errors).length > 0 && <Notice tone='error' title='Fix these first'>{Object.values(errors).join('. ')}.</Notice>}
          </>
        )}

        <div className='flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5'>
          <Button colorScheme='lightGray' size='md' onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
          {step < STEPS.length - 1
            ? <Button colorScheme='brand' size='md' onClick={next} disabled={!stepValid(step)}>Continue</Button>
            : activeIdentity == null
              ? <Button colorScheme='brand' size='md' onClick={openLogin}>Log in to publish</Button>
              : <Button colorScheme='brand' size='md' onClick={publish} disabled={create.isPending || Object.keys(errors).length > 0}>{create.isPending ? 'Publishing…' : 'Publish pool'}</Button>}
        </div>
      </Card>
    </div>
  )
}
