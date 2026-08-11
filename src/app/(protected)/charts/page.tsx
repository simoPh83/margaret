'use client'
import { useMemo } from 'react'
import { Alert, Box, Card, CardContent, Typography } from '@mui/material'
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

      {!isLoading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {rows.length} units{totalSqft > 0 && ` · ${totalSqft.toLocaleString()} sq ft total`}
        </Typography>
      )}
    </Box>
  )
}
