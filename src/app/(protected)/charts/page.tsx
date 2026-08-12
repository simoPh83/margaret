'use client'
import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PieSectorShapeProps } from 'recharts'
import { buildingLabel, cellNumber, cellText, useUnits } from '@/lib/units'

const STATUS_COLORS: Record<string, string> = {
  Let: '#2563eb',
  Vacant: '#f59e0b',
  Mothballed: '#64748b',
  'Under Ref': '#8b5cf6',
  'U-O': '#10b981',
}
const FALLBACK_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
}

const gbp = (v: number) => `£${v.toLocaleString()}`

/** Colours per upcoming-event type. */
const EVENT_COLORS = {
  review: '#16a34a', // green — rent review
  expiry: '#2563eb', // blue  — expiry
  break: '#ef4444',  // red   — break
} as const

type EventType = keyof typeof EVENT_COLORS

interface TimelineEvent {
  /** x position (epoch ms) */
  x: number
  /** lane key for the categorical y-axis */
  lane: string
  label: string
  type: EventType
  dateDisplay: string
  tenant: string
}

/** Period options in days; "-1" means show all. */
const PERIODS: { label: string; days: number }[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ label: `${i + 1} month${i ? 's' : ''}`, days: (i + 1) * 30 })),
  { label: '1 year', days: 365 },
  { label: '2 years', days: 730 },
  { label: '3 years and over', days: -1 },
]

const MS_PER_DAY = 86_400_000
const DAY_START = new Date(new Date().toDateString()).getTime()

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Oct 26' for short ranges, 'Oct 2026' for long ones. */
function axisTick(ms: number, spanDays: number): string {
  const d = new Date(ms)
  const mon = MONTH_SHORT[d.getMonth()]
  return spanDays <= 550 ? `${mon} ${String(d.getFullYear()).slice(2)}` : `${mon} ${d.getFullYear()}`
}

/** Regular calendar ticks: month starts (quarter starts for spans over ~18 months). */
function monthTicks(startMs: number, endMs: number): number[] {
  const spanDays = (endMs - startMs) / MS_PER_DAY
  const step = spanDays > 550 ? 3 : 1
  const ticks: number[] = [startMs]
  const d = new Date(startMs)
  let cur = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
  while (cur < endMs) {
    ticks.push(cur)
    cur = new Date(new Date(cur).getFullYear(), new Date(cur).getMonth() + step, 1).getTime()
  }
  ticks.push(endMs)
  return ticks
}

/** Timeline dots are per-unit up to 1 year; wider windows get a monthly histogram. */
const HISTOGRAM_THRESHOLD_DAYS = 365

function EventTooltip({ active, payload }: { active?: boolean; payload?: { payload?: TimelineEvent }[] }) {
  const d = payload?.[0]?.payload
  if (!active || d == null) return null
  const name = d.type === 'review' ? 'Rent Review' : d.type === 'break' ? 'Break Date' : 'Expiry Date'
  const days = Math.ceil((d.x - DAY_START) / MS_PER_DAY)
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid #e5e5e5', borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', p: 1.5 }}>
      {d.tenant && <Typography variant="body2" sx={{ fontWeight: 700 }}>Tenant: {d.tenant}</Typography>}
      <Typography variant="body2">{d.label}</Typography>
      <Typography variant="body2">
        {name}: {d.dateDisplay} ({days} days)
      </Typography>
    </Box>
  )
}

/** Colour swatches for the three event types (dots for the timeline, squares for counts). */
function EventLegend({ squares = false }: { squares?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 1 }}>
      {(['review', 'expiry', 'break'] as EventType[]).map((t) => (
        <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              bgcolor: EVENT_COLORS[t],
              borderRadius: squares ? 0.5 : '50%',
            }}
          />
          <Typography variant="caption">
            {t === 'review' ? 'Rent Review' : t === 'expiry' ? 'Expiry Date' : 'Break Date'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// Donut sector that grows outward on hover. Recharts 3 sets `isActive` from
// the Tooltip's hover state, so just rendering a larger sector when active
// gives the grow effect (with the tooltip enabled).
function DonutSector(props: PieSectorShapeProps) {
  const { isActive, outerRadius, ...rest } = props
  return (
    <Sector
      {...rest}
      outerRadius={Number(outerRadius ?? 0) + (isActive ? 8 : 0)}
      style={{
        cursor: 'pointer',
        filter: isActive ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' : undefined,
        transition: 'filter 150ms ease-out',
      }}
    />
  )
}

export default function ChartsPage() {
  const { data, isLoading, error } = useUnits()
  const rows = data?.rows ?? []
  const [periodDays, setPeriodDays] = useState(90)

  const ervYear = (data?.raw as { table_data?: { metadata?: { erv_year?: number } } } | undefined)
    ?.table_data?.metadata?.erv_year
  const ervLabel = ervYear ? `ERV (${ervYear})` : 'ERV'

  const statusData = useMemo(() => {
    const groups = new Map<string, { count: number; sqft: number }>()
    for (const row of rows) {
      const status = cellText(row, 'status') || 'Unknown'
      const entry = groups.get(status) ?? { count: 0, sqft: 0 }
      entry.count += 1
      entry.sqft += cellNumber(row, 'sq_ft')
      groups.set(status, entry)
    }
    return [...groups.entries()].map(([name, v]) => ({ name, value: v.count, sqft: v.sqft }))
  }, [rows])

  const rentByBuilding = useMemo(() => {
    const byBuilding = new Map<string | number, { name: string; rent: number; erv: number }>()
    for (const row of rows) {
      const key = row.metadata?.raw_unit?.building_id ?? 'unknown'
      const entry = byBuilding.get(key) ?? { name: buildingLabel(row), rent: 0, erv: 0 }
      entry.rent += cellNumber(row, 'rent')
      entry.erv += cellNumber(row, 'erv')
      byBuilding.set(key, entry)
    }
    return [...byBuilding.values()].sort((a, b) => b.rent - a.rent).slice(0, 12)
  }, [rows])

  const vacancyAging = useMemo(() => {
    const buckets = [
      { name: '< 3 mo', min: 0, max: 90, count: 0 },
      { name: '3–6 mo', min: 90, max: 180, count: 0 },
      { name: '6–12 mo', min: 180, max: 365, count: 0 },
      { name: '1–2 yrs', min: 365, max: 730, count: 0 },
      { name: '2+ yrs', min: 730, max: Infinity, count: 0 },
    ]
    const now = Date.now()
    for (const row of rows) {
      const since = row.cells?.vacant_since?.sort_value
      if (typeof since !== 'string' || !since) continue
      const days = Math.floor((now - new Date(since).getTime()) / 86_400_000)
      if (!Number.isFinite(days) || days < 0) continue
      buckets.find((b) => days >= b.min && days < b.max)!.count++
    }
    return buckets.map(({ name, count }) => ({ name, count }))
  }, [rows])

  const topVacantBuildings = useMemo(() => {
    const byBuilding = new Map<string | number, { name: string; sqft: number }>()
    for (const row of rows) {
      const status = cellText(row, 'status')
      if (status !== 'Vacant' && status !== 'Mothballed') continue
      const key = row.metadata?.raw_unit?.building_id ?? 'unknown'
      const entry = byBuilding.get(key) ?? { name: buildingLabel(row), sqft: 0 }
      entry.sqft += cellNumber(row, 'sq_ft')
      byBuilding.set(key, entry)
    }
    return [...byBuilding.values()].sort((a, b) => b.sqft - a.sqft).slice(0, 5)
  }, [rows])

  const expiriesByYear = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of rows) {
      const value = row.cells?.expiry_date?.sort_value
      if (typeof value !== 'string' || value.length < 4) continue
      const year = Number(value.slice(0, 4))
      if (!Number.isFinite(year)) continue
      counts.set(year, (counts.get(year) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year: String(year), count }))
  }, [rows])

  const totalSqft = rows.reduce((s, r) => s + cellNumber(r, 'sq_ft'), 0)

  // Every future event (rent review / break / expiry) per unit, as timeline dots.
  const timeline = useMemo(() => {
    const events: { x: number; label: string; type: EventType; dateDisplay: string; tenant: string }[] = []
    for (const row of rows) {
      const label = `${cellText(row, 'unit_name')} - ${buildingLabel(row)}`
      const tenant = cellText(row, 'tenant')
      for (const [type, field] of [
        ['review', 'rent_review_date'],
        ['break', 'break_date'],
        ['expiry', 'expiry_date'],
      ] as [EventType, string][]) {
        const iso = row.cells?.[field]?.sort_value
        if (typeof iso !== 'string' || !iso) continue
        const x = new Date(iso).getTime()
        if (!Number.isFinite(x) || x < DAY_START) continue
        events.push({ x, label, type, dateDisplay: cellText(row, field) || iso, tenant })
      }
    }
    return events
  }, [rows])

  const { timelineEvents, laneLabels, xMax, xTicks } = useMemo(() => {
    const windowEnd =
      periodDays === -1 ? Infinity : DAY_START + periodDays * MS_PER_DAY
    const visible = timeline.filter((e) => e.x <= windowEnd)
    // Lanes ordered by each unit's soonest visible event; soonest first.
    const firstEvent = new Map<string, number>()
    for (const e of visible) {
      const prev = firstEvent.get(e.label)
      if (prev === undefined || e.x < prev) firstEvent.set(e.label, e.x)
    }
    const lanes = [...firstEvent.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label)
    const events: TimelineEvent[] = visible.map((e) => ({ ...e, lane: e.label }))
    const latest = events.reduce((m, e) => Math.max(m, e.x), DAY_START + MS_PER_DAY)
    return {
      timelineEvents: events,
      laneLabels: lanes,
      xMax: latest,
      xTicks: monthTicks(DAY_START, latest),
    }
  }, [timeline, periodDays])

  // Beyond the lane-chart threshold, aggregate events per calendar month instead.
  const showHistogram = periodDays === -1 || periodDays > HISTOGRAM_THRESHOLD_DAYS

  const monthlyCounts = useMemo(() => {
    const windowEnd =
      periodDays === -1 ? Infinity : DAY_START + periodDays * MS_PER_DAY
    const buckets = new Map<string, { sortKey: number; review: number; expiry: number; break: number }>()
    for (const e of timeline) {
      if (e.x > windowEnd) continue
      const d = new Date(e.x)
      const key = `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
      const sortKey = d.getFullYear() * 12 + d.getMonth()
      const bucket = buckets.get(key) ?? { sortKey, review: 0, expiry: 0, break: 0 }
      bucket[e.type] += 1
      buckets.set(key, bucket)
    }
    return [...buckets.entries()]
      .sort((a, b) => a[1].sortKey - b[1].sortKey)
      .map(([month, v]) => ({ month, review: v.review, expiry: v.expiry, break: v.break }))
  }, [timeline, periodDays])

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{String(error)}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>Charts</Typography>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1">Upcoming Events Timeline</Typography>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="events-period-label">Show events within</InputLabel>
              <Select
                labelId="events-period-label"
                label="Show events within"
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
              >
                {PERIODS.map((p) => (
                  <MenuItem key={p.label} value={p.days}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {timelineEvents.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No events in the selected period.
            </Typography>
          ) : showHistogram ? (
            <>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyCounts} margin={{ top: 10, right: 24, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="review" name="Rent Review" stackId="events" fill={EVENT_COLORS.review} animationDuration={600} />
                  <Bar dataKey="expiry" name="Expiry Date" stackId="events" fill={EVENT_COLORS.expiry} animationDuration={600} />
                  <Bar dataKey="break" name="Break Date" stackId="events" fill={EVENT_COLORS.break} radius={[4, 4, 0, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
              <EventLegend squares />
            </>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(260, laneLabels.length * 30 + 80)}>
                <ScatterChart margin={{ top: 10, right: 24, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical stroke="#e5e5e5" horizontal={false} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[DAY_START, xMax]}
                    scale="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    ticks={xTicks}
                    tickFormatter={(ms: number) =>
                      axisTick(ms, (xMax - DAY_START) / MS_PER_DAY)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="lane"
                    tickLine={false}
                    axisLine={false}
                    width={240}
                    interval={0}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(label: string) =>
                      label.length > 34 ? `${label.slice(0, 33)}…` : label
                    }
                  />
                  <Tooltip content={<EventTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <ReferenceLine
                    x={DAY_START}
                    stroke="#1f2937"
                    strokeWidth={1.5}
                    label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#1f2937' }}
                  />
                  {(['review', 'expiry', 'break'] as EventType[]).map((t) => (
                    <Scatter
                      key={t}
                      data={timelineEvents.filter((e) => e.type === t)}
                      fill={EVENT_COLORS[t]}
                      shape="circle"
                      isAnimationActive={false}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
              <EventLegend />
            </>
          )}
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Units by Status</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, value }) =>
                    `${name}: ${((Number(value) / rows.length) * 100).toFixed(0)}%`
                  }
                  shape={DonutSector}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {statusData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name, item) => [
                    `${value} units · ${Math.round(Number(item?.payload?.sqft ?? 0)).toLocaleString()} sq ft`,
                    name,
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Rent PA by Building (Top 12)</Typography>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={rentByBuilding} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `£${v / 1000}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={150}
                  interval={0}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(name: string) =>
                    name.length > 22 ? `${name.slice(0, 21)}…` : name
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => gbp(Number(v))}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend />
                <Bar dataKey="rent" name="Rent PA" fill="#2563eb" radius={[0, 4, 4, 0]} animationDuration={800} />
                <Bar dataKey="erv" name={ervLabel} fill="#93c5fd" radius={[0, 4, 4, 0]} animationDuration={800} animationBegin={150} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1">Vacancy Profile</Typography>
            <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
              How long today&rsquo;s vacant units have been empty
            </Typography>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={vacancyAging}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="count" name="Vacant units" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
              Largest vacant space by building (today)
            </Typography>
            {topVacantBuildings.map((b) => (
              <Box key={b.name} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                <Typography variant="body2" noWrap sx={{ mr: 2 }}>{b.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(b.sqft).toLocaleString()} sq ft
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Lease Expiries by Year</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expiriesByYear}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="count" name="Units expiring" fill="#2563eb" radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Box>

      {!isLoading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {rows.length} units{totalSqft > 0 && ` · ${totalSqft.toLocaleString()} sq ft total`}
        </Typography>
      )}
    </Box>
  )
}
