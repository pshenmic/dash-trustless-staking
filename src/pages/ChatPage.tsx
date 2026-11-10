import type { ReactNode } from 'react'
import { Chat } from '../components/Chat'
import { Card, PageHeader } from '../components/ui'

export function ChatPage (): ReactNode {
  return (
    <div className='mx-auto max-w-3xl'>
      <PageHeader title='Community chat' subtitle='Talk to pool creators and members. Each pool also has its own chat.' />
      <Card>
        <Chat channel='global' />
      </Card>
    </div>
  )
}
