import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState } from '../ui'

export function TrendChart ({ trend }: { trend: Array<{ day: number, choices: number }> }): ReactNode {
  if (trend.length === 0) {
    return <Card><EmptyState title='No activity yet'>Recorded choices will appear here over time.</EmptyState></Card>
  }
  const data = trend.map(t => ({ ...t, label: new Date(t.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))
  return (
    <Card>
      <span className='text-small font-bold'>Choices over time</span>
      <div className='mt-3 h-48'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='#9ca3af' strokeOpacity={0.2} />
            <XAxis dataKey='label' tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval='preserveStartEnd' />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <Tooltip cursor={{ fill: '#9ca3af', fillOpacity: 0.1 }} />
            <Bar dataKey='choices' fill='#1d4ed8' radius={[3, 3, 0, 0]} name='Choices' />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}