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
import { cellNumber, cellText, findField, useUnits } from '@/lib/units'

const STATUS_COLORS: Record<string, string> = {
  Let: '#2563eb',
  Vacant: '#f59e0b',
  'Under Offer': '#10b981',
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
  const columns = data?.columns ?? []

  const statusField = findField(columns, /^status$/i)
  const rentField = findField(columns, /rent/i, /^rent_pa$/i)
  const ervField = findField(columns, /erv/i)
  const sqftField = findField(columns, /sq\s*ft|sqft|area|size/i)

  const statusData = useMemo(() => {
    if (!statusField) return []
    const counts = new Map<string, number>()
    for (const row of rows) {
      const status = cellText(row, statusField) || 'Unknown'
      counts.set(status, (counts.get(status) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }))
  }, [rows, statusField])

  const rentByStatus = useMemo(() => {
    if (!statusField || !rentField) return []
    const sums = new Map<string, { rent: number; erv: number }>()
    for (const row of rows) {
      const status = cellText(row, statusField) || 'Unknown'
      const entry = sums.get(status) ?? { rent: 0, erv: 0 }
      entry.rent += cellNumber(row, rentField)
      entry.erv += ervField ? cellNumber(row, ervField) : 0
      sums.set(status, entry)
    }
    return [...sums.entries()].map(([name, v]) => ({ name, ...v }))
  }, [rows, statusField, rentField, ervField])

  const topByRent = useMemo(() => {
    if (!rentField) return []
    const nameField = findField(columns, /unit|name/i) ?? columns[0]?.field
    return rows
      .map((row) => ({
        name: (nameField && cellText(row, nameField)) || '—',
        rent: cellNumber(row, rentField),
      }))
      .sort((a, b) => b.rent - a.rent)
      .slice(0, 10)
  }, [rows, columns, rentField])

  const totalSqft = sqftField ? rows.reduce((s, r) => s + cellNumber(r, sqftField), 0) : 0

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
                  label={({ name, value }) => `${name}: ${value}`}
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
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Passing Rent vs ERV by Status</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rentByStatus}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `£${v / 1000}k`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => gbp(Number(v))}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend />
                <Bar dataKey="rent" name="Rent PA" fill="#2563eb" radius={[4, 4, 0, 0]} animationDuration={800} />
                <Bar dataKey="erv" name="ERV (2025)" fill="#93c5fd" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={150} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ gridColumn: { md: '1 / -1' } }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Top 10 Units by Rent PA</Typography>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={topByRent} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `£${v / 1000}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={180}
                  interval={0}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(name: string) =>
                    name.length > 26 ? `${name.slice(0, 25)}…` : name
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => gbp(Number(v))}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="rent" name="Rent PA" fill="#2563eb" radius={[0, 4, 4, 0]} animationDuration={900} />
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
