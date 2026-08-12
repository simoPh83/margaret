'use client'
import { useMemo, useState } from 'react'
import { DataGrid, GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import {
  Alert,
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { buildingAddress, cellNumber, cellText, useUnits, UnitRow } from '@/lib/units'

/** Fallback status tints; the API also ships a color per status in cell metadata. */
const STATUS_COLORS: Record<string, string> = {
  Let: '#66B266',
  Vacant: '#FFB366',
  'U-O': '#6699FF',
  'Under Ref': '#FFD966',
  Mothballed: '#8B8B8B',
}

function statusColor(row: UnitRow): string | undefined {
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

type ApiColumn = { field: string; headerName: string }

/** Fields shown in every by-state table. */
const SHARED_FIELDS = ['property', 'unit_name', 'sq_ft', 'type', 'erv', 'vacant_since']

interface StateSection {
  key: string
  /** Status cell values that belong to this table. */
  statuses: string[]
  /** Expanded label shown in the table header. */
  title: string
}

const STATE_SECTIONS: StateSection[] = [
  { key: 'let', statuses: ['Let'], title: 'Let' },
  { key: 'vacant', statuses: ['Vacant'], title: 'Vacant' },
  { key: 'uo', statuses: ['U-O'], title: 'U-O — Under Offer' },
  { key: 'under-ref', statuses: ['Under Ref'], title: 'Under Ref — Under Refurbishment' },
  { key: 'mothballed', statuses: ['Mothballed'], title: 'Mothballed' },
]

interface StateTable extends StateSection {
  rows: UnitRow[]
  columns: GridColDef[]
  color: string
}

/**
 * Build grid columns from the API column list.
 * - `only`: restrict to these fields (by-state tables)
 * - `omit`: always excluded (defaults to the internal `id` field)
 */
function buildColumns(allColumns: ApiColumn[], only?: string[], omit: string[] = ['id']): GridColDef[] {
  return (only ? allColumns.filter((c) => only.includes(c.field)) : allColumns)
    .filter((col) => !omit.includes(col.field))
    .map((col) => {
      // cells[field].sort_value for correct sorting; cells[field].display for rendering
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
    })
}

export default function UnitsPage() {
  const { data, isLoading, error } = useUnits()
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const raw = data?.raw
  const [view, setView] = useState<'classic' | 'state'>('classic')

  const columns = useMemo(() => buildColumns(data?.columns ?? []), [data?.columns])

  const stateTables = useMemo<StateTable[]>(() => {
    const allColumns = data?.columns ?? []
    return STATE_SECTIONS.map((section) => {
      const sectionRows = rows.filter((row) =>
        section.statuses.some((s) => s.toLowerCase() === cellText(row, 'status').toLowerCase())
      )
      const isLet = section.key === 'let'
      return {
        ...section,
        rows: sectionRows,
        // LET: same fields as the classic table except "Vacant Since"; others: shared fields only
        columns: isLet
          ? buildColumns(allColumns, undefined, ['id', 'vacant_since'])
          : buildColumns(allColumns, SHARED_FIELDS),
        color:
          (sectionRows[0] && statusColor(sectionRows[0])) ||
          STATUS_COLORS[section.statuses[0]] ||
          '#8B8B8B',
      }
    })
  }, [data?.columns, rows])

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 1 }}>
        <Typography variant="h5">Units</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_e, value) => value && setView(value)}
        >
          <ToggleButton value="classic">Classic view</ToggleButton>
          <ToggleButton value="state">By state</ToggleButton>
        </ToggleButtonGroup>
      </Box>
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
      {rows.length > 0 && view === 'classic' && (
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
      {rows.length > 0 && view === 'state' && <ByStateView tables={stateTables} />}
    </Box>
  )
}

/** By-state layout: LET spans the full width, the other tables flow in a 2-column grid. */
function ByStateView({ tables }: { tables: StateTable[] }) {
  const [order, setOrder] = useState<string[]>(() => tables.map((t) => t.key))
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [dragKey, setDragKey] = useState<string | null>(null)

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** Insert the dragged table just before the table it was dropped on. */
  const handleDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return
    setOrder((prev) => {
      const next = prev.filter((k) => k !== dragKey)
      next.splice(next.indexOf(targetKey), 0, dragKey)
      return next
    })
    setDragKey(null)
  }

  // Group the ordered tables into render blocks: LET tables stand alone (full width),
  // consecutive non-LET tables share a 2-column grid row.
  const byKey = new Map(tables.map((t) => [t.key, t]))
  const blocks: StateTable[][] = []
  for (const key of order) {
    const table = byKey.get(key)
    if (!table) continue
    const last = blocks[blocks.length - 1]
    if (table.key !== 'let' && last && last[0].key !== 'let') {
      last.push(table)
    } else {
      blocks.push([table])
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {blocks.map((block, i) =>
        block.length === 1 && block[0].key === 'let' ? (
          <StateTableCard
            key={block[0].key}
            table={block[0]}
            isCollapsed={collapsed.has(block[0].key)}
            isDragging={dragKey === block[0].key}
            onToggle={() => toggleCollapsed(block[0].key)}
            onDragStart={() => setDragKey(block[0].key)}
            onDragEnd={() => setDragKey(null)}
            onDrop={() => handleDrop(block[0].key)}
          />
        ) : (
          <Box
            key={`grid-${i}`}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}
          >
            {block.map((table) => (
              <StateTableCard
                key={table.key}
                table={table}
                isCollapsed={collapsed.has(table.key)}
                isDragging={dragKey === table.key}
                onToggle={() => toggleCollapsed(table.key)}
                onDragStart={() => setDragKey(table.key)}
                onDragEnd={() => setDragKey(null)}
                onDrop={() => handleDrop(table.key)}
              />
            ))}
          </Box>
        )
      )}
    </Box>
  )
}

function StateTableCard({
  table,
  isCollapsed,
  isDragging,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  table: StateTable
  isCollapsed: boolean
  isDragging: boolean
  onToggle: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
}) {
  const color = table.color
  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      sx={{ overflow: 'hidden', opacity: isDragging ? 0.5 : 1 }}
    >
      {/* Header: drag handle, state name with its colour, unit count, collapse toggle */}
      <Box
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          cursor: 'grab',
          userSelect: 'none',
          bgcolor: tint(color, 0.85),
          borderLeft: `6px solid ${color}`,
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Box component="span" aria-hidden sx={{ color: 'text.secondary', fontSize: 18, lineHeight: 1 }}>
          ⠿
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          {table.title}{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            {table.rows.length} {table.rows.length === 1 ? 'unit' : 'units'}
          </Typography>
        </Typography>
        <IconButton
          size="small"
          onClick={onToggle}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={isCollapsed ? `Expand ${table.title}` : `Collapse ${table.title}`}
        >
          {isCollapsed ? '▸' : '▾'}
        </IconButton>
      </Box>
      <Collapse in={!isCollapsed}>
        <Box sx={{ p: 1 }}>
          <DataGrid
            rows={table.rows as GridValidRowModel[]}
            columns={table.columns}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            hideFooter={table.rows.length <= 25}
            getRowHeight={() => 'auto'}
            getRowClassName={(params) =>
              params.row.metadata?.raw_unit?.remarks ? 'has-remarks' : ''
            }
            sx={{
              border: 'none',
              '& .MuiDataGrid-cell': { py: 1 },
              '& .MuiDataGrid-row.has-remarks .MuiDataGrid-cell[data-field="unit_name"]': {
                cursor: 'help',
                textDecoration: 'underline dotted rgba(0,0,0,0.35)',
                textUnderlineOffset: 3,
              },
            }}
          />
        </Box>
      </Collapse>
    </Paper>
  )
}
