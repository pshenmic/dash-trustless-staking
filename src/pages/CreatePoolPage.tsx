import { Input, ProgressStepBar, Textarea } from 'dash-ui-kit/react'
import { Button } from '../components/Button'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Chip, Field, KeyValue, KeyValueList, Notice, PageHeader, Card } from '../components/ui'
import { errorMessage, useToast } from '../components/Toast'
import { backend } from '../data'
import { randomBase58, randomHex, seededRandom } from '../data/mock/mockHash'
import { useWrite } from '../hooks/data'
import { COLLATERAL, MAX_EARLY_PERIOD_BLOCKS, MAX_SHARES, MIN_SHARES } from '../lib/consensus'
import { blocksToDuration, formatBasisPoints, formatDash, parseDash } from '../lib/format'
import { feeShares, isBlsPublicKey, validatePoolTerms, type PoolTermsInput } from '../lib/rules'
import { fetchOperatorKeyUsage } from '../data/queries'
import { OperatorKeyNotice } from '../components/pool/OperatorKeyNotice'
import { useNetwork } from '../lib/network'
import { useWallet } from '../wallet/WalletContext'
import { config } from '../config'
import { OperatorKeyPicker } from '../components/OperatorKeyPicker'
import { findOperatorKey, findProvider, OPERATOR_PROVIDERS, operatorId } from '../operators'
import { Flag, locationText } from '../components/Flag'

const STEPS = ['Basics', 'Node', 'Exit terms', 'Review'] as const

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
  ['name', 'description'],
  ['operatorPubKey', 'service', 'votingAddress', 'operatorReward'],
  ['earlyPeriodBlocks', 'earlyPenalty'],
  []
]

const DRAFT_KEY = 'dts:pool-draft'

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
  const { notify } = useToast()
  const draft = readDraft()
  const [step, setStep] = useState(draft?.step ?? 0)
  const [touched, setTouched] = useState<boolean[]>(draft?.touched ?? STEPS.map(() => false))
  // 'custom' = the creator runs the node; otherwise a third-party operator's id from src/operators.ts
  const [operatorSource, setOperatorSource] = useState(draft?.operatorSource ?? 'custom')
  // Placeholder operators exist only in the mock preview: their keys are not real
  const providers = OPERATOR_PROVIDERS.filter(p => backend.mode === 'mock' || p.placeholder !== true)
  const provider = providers.find(p => p.id === operatorSource) ?? null
  const [form, setForm] = useState(draft?.form ?? {
    name: '', description: '', service: '', operatorPubKey: '', votingAddress: '',
    operatorReward: '5', earlyPeriodBlocks: '17280', earlyPenalty: '5'
  })

  const terms: PoolTermsInput = {
    name: form.name.trim(),
    description: form.description.trim(),
    // A third-party operator sets the address after registration, so the ProRegTx carries none
    service: provider != null ? '' : form.service.trim(),
    // Only a third-party operator's key carries a location; custom pools leave it out
    location: provider != null ? findOperatorKey(form.operatorPubKey)?.country ?? '' : '',
    operatorPubKey: form.operatorPubKey.trim().toLowerCase(),
    // A third-party operator votes with their own key for the chosen operator key
    votingAddress: provider != null ? findOperatorKey(form.operatorPubKey)?.votingAddress ?? '' : form.votingAddress.trim(),
    // A third-party operator's key fixes the fee; only a custom operator sets their own
    operatorReward: provider != null ? findOperatorKey(form.operatorPubKey)?.operatorReward ?? NaN : Math.round(Number(form.operatorReward) * 100),
    earlyPeriodBlocks: form.earlyPeriodBlocks.trim() === '' ? NaN : Number(form.earlyPeriodBlocks),
    earlyPenalty: parseDash(form.earlyPenalty) ?? NaN,
    // Fixed by the app's configuration, not chosen by the creator
    fee: config.registrationFee
  }
  if (provider == null && (form.operatorReward.trim() === '' || !Number.isFinite(Number(form.operatorReward)))) terms.operatorReward = NaN
  const errors = validatePoolTerms(terms, network, strict)

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
  const stepValid = (i: number): boolean => STEP_FIELDS[i].every(f => errors[f] == null)
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
    if (form.name.trim() !== '' || form.description.trim() !== '' || form.operatorPubKey.trim() !== '') {
      saveDraft({ form, step, operatorSource, touched })
    }
  }, [form, step, operatorSource, touched])

  const next = (): void => {
    setTouched(t => t.map((v, i) => i === step ? true : v))
    if (stepValid(step)) setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  const create = useWrite(async () => {
    const identity = activeIdentityRef.current
    if (identity == null) throw new Error('Connect your identity first')
    // Optional contract fields are left out rather than stored empty
    const { service, location, ...rest } = terms
    return await backend.platform.createPool(identity, {
      ...rest,
      ...(service === '' ? {} : { service }),
      ...(location === '' ? {} : { location })
    })
  })

  const publish = (): void => {
    console.log('publish clicked, errors:', Object.keys(errors).length)
    console.log('activeIdentity:', activeIdentity?.substring(0, 10))
    console.log('platform available:', typeof backend.platform.createPool)
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
            <Field label='Pool name' error={show('name')} htmlFor='pool-name'>
              <Input id='pool-name' value={form.name} maxLength={63} onChange={e => set('name')(e.target.value)} placeholder='e.g. Hyperwave Node #1' />
            </Field>
            <Field label='Description' optional error={show('description')} hint='Who you are, where the node runs, how you’ll keep it online' htmlFor='pool-description'>
              <Textarea id='pool-description' rows={4} showPasteButton={false} value={form.description} onChange={v => set('description')(v.slice(0, 1000))} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label='Operator' hint={provider?.description ?? 'You run the node yourself and hold its operator key.'}>
              <div className='flex flex-wrap gap-2'>
                <Chip active={provider == null} onClick={() => chooseSource('custom')}>Custom</Chip>
                {providers.map(p => (
                  <Chip key={p.id} active={operatorSource === p.id} onClick={() => chooseSource(p.id)}>{p.name}</Chip>
                ))}
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
                    You run this node, so you hold the operator key and the voting key. The operator key also controls
                    the node’s address and your payout address. Members can’t change either key without everyone
                    signing, and neither key can move anyone’s coins.
                  </Notice>
                  <Field
                    label='Masternode IP:PORT'
                    optional
                    error={show('service')}
                    hint='Where the node starts. You can change it any time with your operator key (protx update_service). Leave it empty if the server isn’t ready: the node registers inactive until you set it.'
                    htmlFor='pool-service'
                  >
                    <Input id='pool-service' value={form.service} onChange={e => set('service')(e.target.value)} placeholder='203.0.113.10:9999' spellCheck={false} />
                  </Field>
                  <Field label='Voting address' error={show('votingAddress')} hint='A P2PKH address whose key votes on governance proposals' htmlFor='pool-voting'>
                    <Input id='pool-voting' value={form.votingAddress} onChange={e => set('votingAddress')(e.target.value)} placeholder='y…' spellCheck={false} />
                  </Field>
                  <Field label='Operator fee' error={show('operatorReward')} hint='Your cut of each masternode reward, before members are paid' htmlFor='pool-reward'>
                    <Input id='pool-reward' inputMode='decimal' value={form.operatorReward} onChange={e => set('operatorReward')(e.target.value)} prefix='%' />
                  </Field>
                </>
                )
              : (
                <>
                  <Field label='Operator ID' error={show('operatorPubKey')} hint='Each ID is one of the operator’s keys. A key can back only one masternode, so keys already used by a masternode or another pool can’t be picked.'>
                    <OperatorKeyPicker provider={provider} value={form.operatorPubKey} onChange={set('operatorPubKey')} />
                  </Field>
                  <Notice tone='info'>
                    {provider.name} runs this node and holds its operator and voting keys. The chosen key sets the
                    operator fee and location; {provider.name} sets the node’s address after registration, and the
                    node is inactive until then. Replacing either key takes every member’s signature, and neither key
                    can move anyone’s coins.
                  </Notice>
                </>
                )}

            {backend.mode === 'mock' && provider == null && (
              <button type='button' onClick={fillMockNode} className='self-start text-small font-bold text-brand-ink hover:underline'>Fill with mock data</button>
            )}
          </>
        )}

        {step === 2 && (
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

        {step === 3 && (
          <>
            <Notice tone='warning' title='Terms are permanent'>Once published, these terms can never change. To change anything, create a new pool.</Notice>
            <KeyValueList>
              <KeyValue label='Name'>{terms.name}</KeyValue>
              <KeyValue label='Operator'>
                {findProvider(terms.operatorPubKey) != null
                  ? <>{findProvider(terms.operatorPubKey)?.name} <span className='font-mono font-medium text-muted'>· {operatorId(terms.operatorPubKey)}</span></>
                  : 'You (custom)'}
              </KeyValue>
              <KeyValue label='Operator key'><span className='font-mono text-[12px] break-all'>{terms.operatorPubKey}</span></KeyValue>
              {provider != null && (
                <KeyValue label='Location'>
                  <span className='inline-flex items-center gap-2'><Flag country={terms.location} />{locationText(terms.location)}</span>
                </KeyValue>
              )}
              <KeyValue label='Masternode IP:PORT'>
                {terms.service !== '' ? <span className='font-mono'>{terms.service}</span> : provider != null ? `Set by ${provider.name} after registration` : 'Set after registration'}
              </KeyValue>
              <KeyValue label='Voting address'><span className='font-mono text-small break-all'>{terms.votingAddress}</span></KeyValue>
              <KeyValue label='Operator fee'>{formatBasisPoints(terms.operatorReward)}</KeyValue>
              <KeyValue
                label='Registration fee'
                hint={`Fixed. Split between members: ${formatDash(feeShares(terms.fee, MAX_SHARES)[0])} each with ${MAX_SHARES}, up to ${formatDash(feeShares(terms.fee, MIN_SHARES)[1])} with ${MIN_SHARES}`}
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
