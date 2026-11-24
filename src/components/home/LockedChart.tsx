import { useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DUFFS_PER_DASH } from '../../lib/consensus'
import { cumulativeSeries, type SharePoint } from '../../lib/homeStats'
import { Card, Chip } from '../ui'

const PERIODS = [
  { key: '7d', label: '7d', days: 7 },
  { key: '2w', label: '2w', days: 14 },
  { key: '1m', label: '1m', days: 30 },
  { key: '3m', label: '3m', days: 90 },
  { key: '6m', label: '6m', days: 180 }
] as const

type PeriodKey = typeof PERIODS[number]['key']

/**
 * How much DASH the locks have taken in over time — the shares that actually reached a masternode
 * registration, not every share anyone published. Opens on the last week.
 */
export function LockedChart ({ points }: { points: SharePoint[] }): ReactNode {
  const [period, setPeriod] = useState<PeriodKey>('7d')
  const days = PERIODS.find(item => item.key === period)?.days ?? 7
  const data = cumulativeSeries(points, days).map(point => ({
    label: new Date(point.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dash: point.total / DUFFS_PER_DASH
  }))

  return (
    <Card>
      <div className='flex flex-wrap items-center justify-end gap-1.5'>
        {PERIODS.map(item => (
          <Chip key={item.key} active={item.key === period} onClick={() => setPeriod(item.key)}>{item.label}</Chip>
        ))}
      </div>
      <div className='mt-3 h-56'>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='#9ca3af' strokeOpacity={0.2} />
            <XAxis dataKey='label' tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval='preserveStartEnd' minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={value => [`${Number(value ?? 0).toLocaleString('en-US')} DASH`, 'Locked']} />
            <Area
              type='monotone'
              dataKey='dash'
              name='Locked'
              stroke='#1d4ed8'
              strokeWidth={2}
              fill='#1d4ed8'
              fillOpacity={0.12}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}