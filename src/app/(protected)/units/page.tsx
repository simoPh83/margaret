'use client'
import { DataGrid, GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import { Box, Chip, Tooltip, Typography, Alert } from '@mui/material'
import { buildingAddress, cellNumber, cellText, useUnits } from '@/lib/units'

/** Fallback status tints; the API also ships a color per status in cell metadata. */
const STATUS_COLORS: Record<string, string> = {
  Let: '#66B266',
  Vacant: '#FFB366',
  'U-O': '#6699FF',
  'Under Ref': '#FFD966',
  Mothballed: '#8B8B8B',
}

function statusColor(row: GridValidRowModel): string | undefined {
  const fromApi = row.cells?.status?.metadata?.widget_spec?.color
  return typeof fromApi === 'string' ? fromApi : STATUS_COLORS[cellText(row, 'status')]
}

/** Mix a hex color with white; amount 0..1 (higher = lighter). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 0xff)}, ${mix(n & 0xff)})`
}

function StatusCell({ row }: { row: GridValidRowModel }) {
  const color = statusColor(row) ?? '#8B8B8B'
  return (
    <Chip
      label={cellText(row, 'status') || '—'}
      size="small"
      sx={{
        bgcolor: tint(color, 0.75),
        color: '#1f2937',
        fontWeight: 600,
        border: `1px solid ${color}`,
      }}
    />
  )
}

/** Diverging bar centred on 0: positive grows right (green), negative grows left (red). */
function VarianceBar({ value }: { value: number }) {
  if (value === -999 || !Number.isFinite(value)) {
    return <Typography variant="body2" color="text.disabled">—</Typography>
  }
  const clamped = Math.max(-100, Math.min(100, value))
  const width = Math.abs(clamped) / 2 // percent of half-track
  const positive = clamped >= 0
  return (
    <Tooltip title={`${positive ? '+' : ''}${value.toFixed(1)}% vs ERV`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* compact track; bar capped at ±100% of half-track */}
        <Box sx={{ position: 'relative', width: 64, flex: 'none', height: 8, bgcolor: 'rgba(0,0,0,0.06)', borderRadius: 1 }}>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: '1px',
              bgcolor: 'rgba(0,0,0,0.25)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: positive ? '50%' : `${50 - width}%`,
              width: `${width}%`,
              bgcolor: positive ? '#16a34a' : '#dc2626',
              borderRadius: 1,
              transition: 'width 300ms ease-out',
            }}
          />
        </Box>
        <Typography variant="body2" sx={{ minWidth: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {positive ? '+' : ''}{value.toFixed(1)}%
        </Typography>
      </Box>
    </Tooltip>
  )
}

export default function UnitsPage() {
  const { data, isLoading, error } = useUnits()
  const rows = data?.rows ?? []
  const raw = data?.raw

  // cells[field].sort_value for correct sorting; cells[field].display for rendering
  const columns: GridColDef[] = (data?.columns ?? [])
    .filter((col: { field: string }) => col.field !== 'id')
    .map(
    (col: { field: string; headerName: string }) => {
      const base: GridColDef = {
        field: col.field,
        headerName: col.headerName,
        valueGetter: (_value: unknown, row: GridValidRowModel) =>
          row.cells?.[col.field]?.sort_value ?? row.cells?.[col.field]?.display,
        renderCell: (params: { row: GridValidRowModel }) =>
          params.row.cells?.[col.field]?.display,
      }
      if (col.field === 'status') {
        base.renderCell = (params) => <StatusCell row={params.row} />
        base.width = 110
      } else if (col.field === 'property') {
        base.renderCell = (params) => {
          const name: string | undefined = params.row.metadata?.raw_unit?.property_name
          const address = buildingAddress(params.row)
          if (name) {
            return (
              <Box sx={{ lineHeight: 1.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'normal' }}>{name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', display: 'block' }}>
                  {address}
                </Typography>
              </Box>
            )
          }
          return (
            <Box sx={{ whiteSpace: 'normal', fontWeight: 600 }}>{cellText(params.row, 'property')}</Box>
          )
        }
        base.width = 220
      } else if (col.field === 'unit_name') {
        base.renderCell = (params) => {
          const remarks: string | undefined = params.row.metadata?.raw_unit?.remarks
          const label = cellText(params.row, 'unit_name')
          return remarks ? (
            <Tooltip
              title={remarks}
              arrow
              placement="top-start"
              enterDelay={200}
              slotProps={{ tooltip: { sx: { fontSize: '0.875rem' } } }}
            >
              <Box component="span" sx={{ whiteSpace: 'normal' }}>{label}</Box>
            </Tooltip>
          ) : (
            <Box component="span" sx={{ whiteSpace: 'normal' }}>{label}</Box>
          )
        }
        base.width = 240
      } else if (col.field === 'variance') {
        base.renderCell = (params) => (
          <VarianceBar value={cellNumber(params.row, 'variance')} />
        )
        base.width = 150
      }
      return base
    }
  )

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>Units</Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {String(error)}
        </Alert>
      )}
      {/* Temporary: show raw API shape until column mapping is confirmed */}
      {!isLoading && rows.length === 0 && !error && (
        <Box component="pre" sx={{ fontSize: 12, overflowX: 'auto', mb: 2, bgcolor: '#f5f5f5', p: 2 }}>
          {JSON.stringify(raw, null, 2)}
        </Box>
      )}
      {rows.length > 0 && (
        <DataGrid
          rows={rows as GridValidRowModel[]}
          columns={columns}
          loading={isLoading}
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          getRowHeight={() => 'auto'}
          getRowClassName={(params) =>
            params.row.metadata?.raw_unit?.remarks ? 'has-remarks' : ''
          }
          sx={{
            '& .MuiDataGrid-cell': { py: 1 },
            '& .MuiDataGrid-row.has-remarks .MuiDataGrid-cell[data-field="unit_name"]': {
              cursor: 'help',
              textDecoration: 'underline dotted rgba(0,0,0,0.35)',
              textUnderlineOffset: 3,
            },
          }}
        />
      )}
    </Box>
  )
}
