import { Accordion } from 'dash-ui-kit/react'
import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Card, CodeBlock, Notice, PageHeader } from '../components/ui'

const SECTIONS = [
  { id: 'how', title: 'How it works' },
  { id: 'identity', title: 'Your identity' },
  { id: 'extension', title: 'Logging in' },
  { id: 'signing', title: 'Signing with your wallet' },
  { id: 'leaving', title: 'Leaving a pool' },
  { id: 'faq', title: 'Risks and questions' },
  { id: 'glossary', title: 'Glossary' }
]

const FAQ = [
  {
    q: 'Can the pool creator take my coins?',
    a: 'No. Dash consensus only ever refunds your principal to the refund address you set when joining, and pays your rewards to your reward address. The creator holds the operator and voting keys, which can run the node and vote, but can’t move coins. Changing either key takes every member’s signature.'
  },
  {
    q: 'What if a member never signs?',
    a: 'The pool stays in Signing and never registers. Your coins never leave your wallet, because the registration needs every member’s signature. The creator can’t re-lock the pool; they create a new one instead.'
  },
  {
    q: 'Can I spend my coins after joining?',
    a: 'Technically yes, but then the registration transaction becomes invalid and the pool can never form. Keep your UTXOs unspent until the masternode registers. Creators can ban members who do this.'
  },
  {
    q: 'What does the early exit penalty do?',
    a: 'During the early period after registration, a member who dissolves alone pays the penalty, which is shared by the other members. It protects everyone from a member leaving right after the node starts. After the early period, leaving is free. A pool with no penalty lets anyone leave at any time.'
  },
  {
    q: 'What happens if the node gets PoSe-banned?',
    a: 'The masternode stops earning and the pool shows Error. Your coins are safe. The operator fixes the server and sends a ProUpServTx to bring it back. If they don’t, any member can dissolve.'
  },
  {
    q: 'Is the chat private?',
    a: 'Each pool has two chats. The public chat is readable by anyone, forever. The private chat opens when the pool is locked and is encrypted for the selected members who joined with an encryption key on their identity; the creator can’t read it unless they also hold a share. Even so, it can’t be deleted, anyone can see who posted and when, and any member could copy messages out, so don’t post secrets.'
  },
  {
    q: 'Can I change my reward address later?',
    a: 'The protocol supports it (ProUpShareTx). This app will add it in a later version. Your refund address can never change.'
  },
  {
    q: 'Does this app have a server?',
    a: 'No. It reads and writes Dash Platform documents and chain data through DAPI, the network’s own API. You can download it and run it locally.'
  }
]

const GLOSSARY = [
  ['Pool', 'One shared masternode: its terms, set by the creator, plus the members who fund it.'],
  ['Share', 'A member’s part of the 1000 DASH collateral, between 100 and 1000 DASH. Rewards are split by share.'],
  ['Lock', 'The creator’s final selection of members. After the lock, the registration transaction is fixed.'],
  ['Consent', 'A signature by your share owner key over the exact registration transaction and terms.'],
  ['Share owner key', 'The key behind the owner address you give when joining. It signs your consent and your dissolution.'],
  ['Refund address', 'Where your principal returns when the masternode dissolves. It can never change.'],
  ['ProRegTx', 'The special transaction that registers a masternode. A shared ProRegTx carries every member’s share.'],
  ['ProDisTx', 'The special transaction that dissolves a shared masternode and refunds every member.'],
  ['PoSe', 'Proof of Service. Masternodes that don’t do their job get penalized and eventually banned.']
]

export function GuidePage (): ReactNode {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash === '') return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div className='grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]'>
      <nav className='hidden lg:block' aria-label='Guide sections'>
        <ul className='sticky top-24 flex flex-col gap-1 text-small'>
          {SECTIONS.map(s => (
            <li key={s.id}>
              <button type='button' className='rounded-full px-3 py-1.5 text-left font-semibold text-muted hover:bg-surface hover:text-fg' onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}>
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className='flex max-w-3xl flex-col gap-10'>
        <PageHeader title='Guide' subtitle='Everything you need to join or run a shared masternode.' />

        <Section id='how' title='How it works'>
          <p>
            A Dash masternode needs 1000 DASH of collateral. With shared masternodes (Dash Core v24), 2 to 8 people
            fund one masternode together in a single registration transaction. Dash itself records every share,
            pays rewards to each member, and refunds everyone when the masternode dissolves.
          </p>
          <ol className='list-decimal space-y-2 pl-5'>
            <li><strong>Create.</strong> A pool creator publishes the terms: server address, operator and voting keys, operator fee, early exit terms and the registration fee.</li>
            <li><strong>Join.</strong> Members publish their share: amount, share owner address, refund address, optional reward address, the UTXOs that fund it and a change address.</li>
            <li><strong>Lock.</strong> The creator selects members whose shares add up to exactly 1000 DASH. From now on the transaction is fixed.</li>
            <li><strong>Consent.</strong> Each member signs the registration’s consent hash with their share owner key.</li>
            <li><strong>Fund.</strong> Each member signs their own inputs.</li>
            <li><strong>Broadcast.</strong> The creator, or anyone, broadcasts the registration. The next block creates the masternode.</li>
          </ol>
          <p>Pool statuses: <strong>Open</strong> (accepting joins), <strong>Signing</strong> (locked, collecting signatures), <strong>Formed</strong> (running), <strong>Error</strong> (PoSe-banned or revoked) and <strong>Dissolved</strong>.</p>
        </Section>

        <Section id='identity' title='Your identity'>
          <p>
            Every pool, join, signature and message is a document on Dash Platform, published by a Platform
            identity. You need one to create or join a pool. An identity is funded with a small amount of DASH
            converted into credits, which pay for the documents you publish.
          </p>
          <Notice tone='info' title='Setting up an identity'>
            You need a Dash Platform identity on testnet and its authentication and encryption private keys. The
            extension can create or import the wallet; any wallet that exports the identity keys works.
          </Notice>
        </Section>

        <Section id='extension' title='Logging in'>
          <p>
            Dash Platform Extension is the preferred login, but its next release is not out yet, so the option is
            disabled in the dialog. Until then, log in with two private keys of the same identity:
          </p>
          <ol className='list-decimal space-y-2 pl-5'>
            <li>The <strong>authentication</strong> private key: an AUTHENTICATION key with HIGH or CRITICAL security, which signs your actions.</li>
            <li>The <strong>encryption</strong> private key: an ENCRYPTION or DECRYPTION key, which opens the private chat.</li>
            <li>Press <strong>Log in</strong>, paste both keys into the dialog and submit. They stay in this browser so the session survives a reload.</li>
          </ol>
          <p>
            When the extension release lands, the extension option will come back enabled and take over both keys.
          </p>
        </Section>

        <Section id='signing' title='Signing with your wallet'>
          <p>
            Signatures for the masternode itself come from your Dash wallet, not the app. The app shows what to
            sign; you sign in your wallet and paste the result back. Your wallet decodes the transaction and shows
            the terms, so check them there. Wallets are adding support for shared masternodes; Dash Core supports
            it from v24:
          </p>
          <div className='flex flex-col gap-3'>
            <div><div className='mb-1 text-small font-bold'>Consent</div><CodeBlock>protx shared_sign &lt;transaction hex&gt;</CodeBlock></div>
            <div><div className='mb-1 text-small font-bold'>Funding</div><CodeBlock>signrawtransactionwithwallet &lt;transaction hex&gt;</CodeBlock></div>
            <div><div className='mb-1 text-small font-bold'>Dissolve</div><CodeBlock>protx shared_dissolve &lt;proTxHash&gt; &lt;your share index&gt; &lt;fee in duffs&gt; false</CodeBlock></div>
          </div>
          <p>Use a new address from your wallet as the share owner address, and keep the wallet backed up: that key is how you leave the pool on your own.</p>
        </Section>

        <Section id='leaving' title='Leaving a pool'>
          <p>
            Any member can dissolve the masternode at any time without asking anyone. Dissolving ends it for
            everyone: each member’s principal goes back to their refund address. During the early period, whoever
            dissolves alone pays the pool’s early exit penalty to the others. Open the pool, choose
            <strong> Dissolve</strong>, sign in your wallet and broadcast.
          </p>
        </Section>

        <Section id='faq' title='Risks and questions'>
          <div className='flex flex-col gap-2'>
            {FAQ.map(item => (
              <Accordion key={item.q} title={item.q} border>
                <p className='text-small text-muted'>{item.a}</p>
              </Accordion>
            ))}
          </div>
        </Section>

        <Section id='glossary' title='Glossary'>
          <dl className='divide-y divide-line/70'>
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term} className='grid grid-cols-1 gap-1 py-3 sm:grid-cols-[180px_1fr]'>
                <dt className='font-bold'>{term}</dt>
                <dd className='text-muted'>{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  )
}

function Section ({ id, title, children }: { id: string, title: string, children: ReactNode }): ReactNode {
  return (
    <section id={id} className='scroll-mt-24'>
      <Card className='flex flex-col gap-4 leading-relaxed'>
        <h2 className='text-section'>{title}</h2>
        {children}
      </Card>
    </section>
  )
}
