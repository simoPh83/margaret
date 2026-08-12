'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  ResponsiveContainer,
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

interface TimelineUnit {
  unit: string
  building: string
  tenant: string
  dateDisplay: string
}

interface DayBucket {
  /** Days from today (integer) */
  x: number
  lane: string
  type: EventType
  count: number
  units: TimelineUnit[]
  /** ISO date string for display */
  dateDisplay: string
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

/** Returns day-offset ticks: 0 = today, then each Monday, then month starts for long spans. */
function buildTicks(maxDays: number): number[] {
  const ticks: number[] = [0]
  const today = new Date(DAY_START)
  if (maxDays <= 150) {
    const dow = today.getDay()
    const toNextMonday = (8 - dow) % 7 || 7
    for (let d = toNextMonday; d < maxDays; d += 7) ticks.push(d)
  } else {
    const step = maxDays > 550 ? 3 : 1
    let cur = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    while (true) {
      const days = Math.round((cur.getTime() - DAY_START) / MS_PER_DAY)
      if (days >= maxDays) break
      ticks.push(days)
      cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1)
    }
  }
  ticks.push(maxDays)
  return ticks
}

/** Format a day-offset tick label. */
function axisTick(dayOffset: number, maxDays: number): string {
  const d = new Date(DAY_START + dayOffset * MS_PER_DAY)
  const mon = MONTH_SHORT[d.getMonth()]
  if (maxDays <= 150) return `${d.getDate()} ${mon}`
  return maxDays <= 550 ? `${mon} '${String(d.getFullYear()).slice(2)}` : `${mon} ${d.getFullYear()}`
}

/** Timeline dots are per-unit up to 1 year; wider windows get a monthly histogram. */
const HISTOGRAM_THRESHOLD_DAYS = 365

const EVENT_LABELS: Record<EventType, string> = {
  review: 'Rent Review',
  expiry: 'Expiry Date',
  break: 'Break Date',
}

/** Count-badge tooltip content (pure React, not a recharts callback). */
function EventTooltipContent({ bucket }: { bucket: DayBucket }) {
  const date = new Date(DAY_START + bucket.x * MS_PER_DAY)
  const dateLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid #e5e5e5', borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', p: 1.5, maxWidth: 340 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {EVENT_LABELS[bucket.type]} · {dateLabel} ({bucket.x} days)
      </Typography>
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
        {bucket.units.map((u, i) => (
          <li key={i}>
            <Typography variant="body2">
              <strong>{u.unit}</strong> — {u.building}
              {u.tenant ? ` · ${u.tenant}` : ''}
            </Typography>
          </li>
        ))}
      </Box>
    </Box>
  )
}

/** Custom SVG timeline — avoids recharts axis bugs entirely. */
function TimelinePanel({ events, maxDays, ticks }: { events: DayBucket[]; maxDays: number; ticks: number[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hovered, setHovered] = useState<{ bucket: DayBucket; px: number; py: number } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.offsetWidth || 600)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ML = 110, MR = 24, MT = 20, MB = 32
  const ROW_H = 60
  const LANES = [EVENT_LABELS.review, EVENT_LABELS.expiry, EVENT_LABELS.break] as const
  const plotW = Math.max(width - ML - MR, 10)
  const svgH = MT + LANES.length * ROW_H + MB

  const xPx = (d: number) => ML + (d / maxDays) * plotW
  const laneY = (lane: string) => {
    const i = LANES.indexOf(lane as typeof LANES[number])
    return MT + (i === -1 ? 0 : i + 0.5) * ROW_H
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg width={width} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
        {/* Vertical gridlines */}
        {ticks.map((t) => (
          <line key={t} x1={xPx(t)} y1={MT} x2={xPx(t)} y2={MT + LANES.length * ROW_H}
            stroke="#e5e5e5" strokeDasharray="3 3" />
        ))}
        {/* Today line */}
        <line x1={xPx(0)} y1={MT} x2={xPx(0)} y2={MT + LANES.length * ROW_H} stroke="#374151" strokeWidth={1.5} />
        <text x={xPx(0) + 4} y={MT + 11} fontSize={11} fill="#374151">Today</text>
        {/* Horizontal lane separators */}
        {LANES.map((_, i) => (
          <line key={i} x1={ML} y1={MT + i * ROW_H} x2={ML + plotW} y2={MT + i * ROW_H} stroke="#f0f0f0" />
        ))}
        {/* Y axis labels */}
        {LANES.map((lane, i) => (
          <text key={lane} x={ML - 8} y={MT + (i + 0.5) * ROW_H + 4}
            textAnchor="end" fontSize={12} fill="#374151">{lane}</text>
        ))}
        {/* X axis tick labels */}
        {ticks.map((t) => (
          <text key={t} x={xPx(t)} y={MT + LANES.length * ROW_H + 18}
            textAnchor="middle" fontSize={11} fill="#6b7280">
            {axisTick(t, maxDays)}
          </text>
        ))}
        {/* Count pills */}
        {events.map((bucket, i) => {
          const cx = xPx(bucket.x)
          const cy = laneY(bucket.lane)
          const color = EVENT_COLORS[bucket.type]
          const W = 30, H = 20
          return (
            <g key={i} className="count-badge" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered({ bucket, px: cx, py: cy })}
              onMouseLeave={() => setHovered(null)}
            >
              <rect x={cx - W / 2} y={cy - H / 2} width={W} height={H} rx={10}
                fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
                {bucket.count}
              </text>
            </g>
          )
        })}
      </svg>
      {hovered && (
        <div style={{
          position: 'absolute',
          left: hovered.px,
          top: hovered.py - 10,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <EventTooltipContent bucket={hovered.bucket} />
        </div>
      )}
    </div>
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

  // Future events grouped by (day-offset, type) — x is integer days from today.
  const timeline = useMemo(() => {
    const buckets = new Map<string, DayBucket>()
    for (const row of rows) {
      const unit: TimelineUnit = {
        unit: cellText(row, 'unit_name'),
        building: buildingLabel(row),
        tenant: cellText(row, 'tenant'),
        dateDisplay: '',
      }
      for (const [type, field] of [
        ['review', 'rent_review_date'],
        ['break', 'break_date'],
        ['expiry', 'expiry_date'],
      ] as [EventType, string][]) {
        const iso = row.cells?.[field]?.sort_value
        if (typeof iso !== 'string' || !iso) continue
        const parts = iso.slice(0, 10).split('-').map(Number)
        if (parts.length < 3 || !parts[0]) continue
        const eventMs = new Date(parts[0], parts[1] - 1, parts[2]).getTime()
        const x = Math.round((eventMs - DAY_START) / MS_PER_DAY)
        if (x < 0) continue
        const key = `${type}:${x}`
        const bucket = buckets.get(key) ?? { x, lane: EVENT_LABELS[type], type, count: 0, units: [], dateDisplay: cellText(row, field) || iso }
        bucket.count += 1
        bucket.units.push({ ...unit, dateDisplay: cellText(row, field) || iso })
        buckets.set(key, bucket)
      }
    }
    return [...buckets.values()]
  }, [rows])

  const { timelineEvents, xMax, xTicks } = useMemo(() => {
    const events = periodDays === -1 ? timeline : timeline.filter((e) => e.x <= periodDays)
    const max = events.reduce((m, e) => Math.max(m, e.x), 1)
    return { timelineEvents: events, xMax: max, xTicks: buildTicks(max) }
  }, [timeline, periodDays])

  // Beyond the lane-chart threshold, aggregate events per calendar month instead.
  const showHistogram = periodDays === -1 || periodDays > HISTOGRAM_THRESHOLD_DAYS

  const monthlyCounts = useMemo(() => {
    const windowEnd = periodDays === -1 ? Infinity : periodDays
    const buckets = new Map<string, { sortKey: number; review: number; expiry: number; break: number }>()
    for (const e of timeline) {
      if (e.x > windowEnd) continue
      const d = new Date(DAY_START + e.x * MS_PER_DAY)
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

      <Card variant="outlined" sx={{ mt: 3 }}>
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
              <TimelinePanel events={timelineEvents} maxDays={xMax} ticks={xTicks} />
              <EventLegend />
            </>
          )}
        </CardContent>
      </Card>

      {!isLoading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {rows.length} units{totalSqft > 0 && ` · ${totalSqft.toLocaleString()} sq ft total`}
        </Typography>
      )}
    </Box>
  )
}
