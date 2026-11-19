import { useState, type ReactNode } from 'react'
import { useProposalSentiment } from '../../hooks/data'
import { EmptyState, Loading } from '../ui'
import { SentimentView } from './SentimentView'

/** Collapsible "how other pools lean" panel; the sentiment query mounts only on first expand */
export function NetworkPanel ({ proposalHash, excludePoolId }: { proposalHash: string, excludePoolId: string }): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div className='flex flex-col gap-2'>
      <button
        type='button'
        className='self-start text-tag font-bold text-brand-ink hover:underline'
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'Hide other pools' : 'How other pools lean'}
      </button>
      {open && <NetworkPanelBody proposalHash={proposalHash} excludePoolId={excludePoolId} />}
    </div>
  )
}

function NetworkPanelBody ({ proposalHash, excludePoolId }: { proposalHash: string, excludePoolId: string }): ReactNode {
  const { data, isLoading, error } = useProposalSentiment(proposalHash)
  if (isLoading) return <Loading />
  if (error != null) return <EmptyState title='Could not load sentiment'>{String(error)}</EmptyState>
  if (data == null) return <Loading />
  return <SentimentView sentiment={data} excludePoolId={excludePoolId} />
}