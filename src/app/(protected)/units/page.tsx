'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { DataGrid, GridColDef, GridRowSelectionModel, GridValidRowModel, useGridApiRef } from '@mui/x-data-grid'
import {
  Alert,
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha, type Theme, useTheme } from '@mui/material/styles'
import { GridPagination } from '@mui/x-data-grid'
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

function dataGridStyles(theme: Theme, height: string) {
  const underlineColor = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.5 : 0.35)

  return {
    height,
    bgcolor: 'background.paper',
    borderColor: 'divider',
    '& .MuiDataGrid-columnHeaders': {
      bgcolor: 'background.paper',
      borderBottomColor: 'divider',
    },
    '& .MuiDataGrid-footerContainer': {
      bgcolor: 'background.paper',
      borderTopColor: 'divider',
    },
    '& .MuiDataGrid-cell': {
      py: 1,
      borderColor: 'divider',
    },
    '& .MuiDataGrid-columnHeader': {
      borderColor: 'divider',
    },
    '& .MuiDataGrid-row': {
      borderColor: 'divider',
    },
    '& .MuiDataGrid-row:hover': {
      bgcolor: 'action.hover',
    },
    '& .MuiDataGrid-row.has-remarks .MuiDataGrid-cell[data-field="unit_name"]': {
      cursor: 'help',
      textDecoration: `underline dotted ${underlineColor}`,
      textUnderlineOffset: 3,
    },
  }
}

function StatusCell({ row }: { row: GridValidRowModel }) {
  const theme = useTheme()
  const color = statusColor(row) ?? theme.palette.grey[500]
  return (
    <Chip
      label={cellText(row, 'status') || '—'}
      size="small"
      sx={{
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.24 : 0.16),
        color,
        fontWeight: 600,
        border: `1px solid ${alpha(color, theme.palette.mode === 'dark' ? 0.52 : 0.32)}`,
      }}
    />
  )
}

/** Diverging bar centred on 0: positive grows right (green), negative grows left (red). */
function VarianceBar({ value }: { value: number }) {
  const theme = useTheme()
  if (value === -999 || !Number.isFinite(value)) {
    return <Typography variant="body2" color="text.disabled">—</Typography>
  }
  const clamped = Math.max(-100, Math.min(100, value))
  const width = Math.abs(clamped) / 2 // percent of half-track
  const positive = clamped >= 0
  const trackColor = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.06)
  const dividerColor = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.34 : 0.22)
  return (
    <Tooltip title={`${positive ? '+' : ''}${value.toFixed(1)}% vs ERV`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* compact track; bar capped at ±100% of half-track */}
        <Box sx={{ position: 'relative', width: 64, flex: 'none', height: 8, bgcolor: trackColor, borderRadius: 1 }}>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: '1px',
              bgcolor: dividerColor,
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

/**
 * Case-insensitive substring match across every cell's display text, plus the
 * property name, address and remarks carried in row metadata (not all of which
 * are rendered as columns).
 */
function rowMatchesSearch(row: UnitRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const raw = row.metadata?.raw_unit
  const haystack = [
    ...Object.values(row.cells ?? {}).map((c) => c.display),
    raw?.property_name,
    raw?.formatted_address,
    raw?.remarks,
  ]
  return haystack.some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
}

/** Numeric fields that get a total in the footer bar. */
const TOTAL_NUMERIC_FIELDS = ['sq_ft', 'rent', 'erv', 'variance']

/** Status value used to identify let units for the ERV variation total. */
const LET_STATUS = 'let'

/** Parse a cell's numeric value (sort_value first, then display text). Null when empty/non-numeric. */
function cellNumberOrNull(row: UnitRow, field: string): number | null {
  const cell = row.cells?.[field]
  if (!cell) return null
  if (typeof cell.sort_value === 'number') return cell.sort_value
  const raw = String(cell.sort_value ?? cell.display ?? '').trim()
  if (!raw) return null
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Format a footer total like the cells do: £ for money, thousands separators, ±x.x% for variance. */
function formatTotal(field: string, total: number): string {
  const sign = total < 0 ? '−' : ''
  const abs = Math.abs(total)
  if (field === 'rent' || field === 'erv') return `${sign}£${Math.round(abs).toLocaleString('en-GB')}`
  if (field === 'variance') return `${total >= 0 ? '+' : '−'}${abs.toFixed(1)}%`
  if (field === 'sq_ft') return Math.round(abs).toLocaleString('en-GB')
  return abs.toLocaleString('en-GB')
}

interface TableTotals {
  properties: number
  units: number
  numeric: Record<string, number | null>
}

/** Totals over ALL rows of the table — pagination and filters do not affect them. */
function computeTotals(
  rows: UnitRow[],
  fields: string[],
  { includeVariance = true }: { includeVariance?: boolean } = {}
): TableTotals {
  const numeric: Record<string, number | null> = {}
  for (const field of fields) {
    if (!TOTAL_NUMERIC_FIELDS.includes(field)) continue
    if (field === 'variance' && !includeVariance) continue
    let sum = 0
    let hasValue = false
    // ERV variation: sq-ft-weighted average over LET units only — vacant
    // units carry variance = 0 (no passing rent to compare). The API also
    // uses -999 as a "no data" sentinel (same rule as VarianceBar), which
    // must be excluded or it poisons the average.
    let weightedSum = 0
    let totalWeight = 0
    for (const row of rows) {
      const n = cellNumberOrNull(row, field)
      if (n === null) continue
      if (field === 'variance') {
        if (n <= -999) continue
        if (cellText(row, 'status').toLowerCase() !== LET_STATUS) continue
        const weight = cellNumberOrNull(row, 'sq_ft')
        if (weight !== null && weight > 0) {
          weightedSum += n * weight
          totalWeight += weight
        }
      } else {
        sum += n
      }
      hasValue = true
    }
    if (field === 'variance') {
      numeric[field] = totalWeight > 0 ? weightedSum / totalWeight : null
    } else {
      numeric[field] = hasValue ? sum : null
    }
  }
  // Count single properties by building identity, falling back to the cell display.
  const propertyKeys = new Set(
    rows.map((row) => {
      const raw = row.metadata?.raw_unit
      return raw?.building_id != null ? `b${raw.building_id}` : cellText(row, 'property')
    })
  )
  return { properties: propertyKeys.size, units: rows.length, numeric }
}

const TOTALS_LABELS: Record<string, string> = {
  sq_ft: 'Sq Ft',
  rent: 'Rent PA',
  erv: 'ERV',
  variance: 'ERV Var',
}

const TOTALS_TOOLTIPS: Record<string, string> = {
  variance:
    'Average ERV variation across let units only, weighted by square footage (larger units count more). Units without an ERV or rent are excluded.',
}

/**
 * Totals summary content. Counts + numeric totals always cover ALL rows of the
 * table, regardless of pagination.
 */
function TotalsSummary({ totals }: { totals: TableTotals }) {
  const theme = useTheme()
  const parts: React.ReactNode[] = [
    <span key="p">{totals.properties} {totals.properties === 1 ? 'property' : 'properties'}</span>,
    <span key="u">{totals.units} {totals.units === 1 ? 'unit' : 'units'}</span>,
  ]
  for (const field of TOTAL_NUMERIC_FIELDS) {
    const total = totals.numeric[field]
    if (total !== null && total !== undefined) {
      const content = <span>{TOTALS_LABELS[field]} {formatTotal(field, total)}</span>
      const tooltip = TOTALS_TOOLTIPS[field]
      parts.push(
        tooltip ? (
          <Tooltip
            key={field}
            title={tooltip}
            arrow
            slotProps={{ tooltip: { sx: { fontSize: '0.95rem' } } }}
          >
            <Box
              component="span"
              sx={{
                cursor: 'help',
                textDecoration: `underline dotted ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.5 : 0.35)}`,
                textUnderlineOffset: 3,
              }}
            >
              {content}
            </Box>
          </Tooltip>
        ) : (
          <span key={field}>{content}</span>
        )
      )
    }
  }
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        fontSize: '0.8125rem',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        '& > span:not(:last-child)::after': { content: '"·"', ml: 1, color: 'text.disabled' },
      }}
    >
      {parts}
    </Box>
  )
}

/**
 * Custom grid footer: totals on the left, pagination on the right, one line.
 * Rendered via the grid's `footer` slot, so it is always frozen at the bottom.
 * GridPagination handles its own state via the grid context.
 */
function TableFooter({ totals }: { totals: TableTotals }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        columnGap: 2,
        width: '100%',
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        pl: 2,
      }}
    >
      <TotalsSummary totals={totals} />
      <GridPagination />
    </Box>
  )
}

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
  totals: TableTotals
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
  return (
    <Suspense>
      <UnitsPageContent />
    </Suspense>
  )
}

function UnitsPageContent() {
  const theme = useTheme()
  const { data, isLoading, error } = useUnits()
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const raw = data?.raw
  const searchParams = useSearchParams()
  const unitParam = searchParams.get('unit')
  const buildingParam = searchParams.get('building')
  const buildingIdParam = searchParams.get('bid')
  // Deep link from the events timeline: pre-fill the search box with the
  // PROPERTY name (unit names repeat across buildings, so searching by unit
  // name would list unrelated units) and show the classic view. The search is
  // lazy-initialised because this page remounts on navigation.
  const [view, setView] = useState<'classic' | 'state'>('classic')
  const [search, setSearch] = useState(() => buildingParam ?? unitParam ?? '')
  const apiRef = useGridApiRef()
  const [selectionOverride, setSelectionOverride] = useState<GridRowSelectionModel | null>(null)

  // Filter the FULL dataset before the grid paginates, so matches are found in
  // records on any page. Totals and the by-state tables follow the filter too.
  const filteredRows = useMemo(
    () => (search.trim() ? rows.filter((row) => rowMatchesSearch(row, search)) : rows),
    [rows, search]
  )

  const columns = useMemo(() => buildColumns(data?.columns ?? []), [data?.columns])
  const totals = useMemo(() => computeTotals(filteredRows, columns.map((c) => c.field)), [filteredRows, columns])

  const stateTables = useMemo<StateTable[]>(() => {
    const allColumns = data?.columns ?? []
    return STATE_SECTIONS.map((section) => {
      const sectionRows = filteredRows.filter((row) =>
        section.statuses.some((s) => s.toLowerCase() === cellText(row, 'status').toLowerCase())
      )
      const isLet = section.key === 'let'
      const sectionColumns = isLet
        ? buildColumns(allColumns, undefined, ['id', 'vacant_since'])
        : buildColumns(allColumns, SHARED_FIELDS)
      return {
        ...section,
        rows: sectionRows,
        // LET: same fields as the classic table except "Vacant Since"; others: shared fields only
        columns: sectionColumns,
        // The ERV variation total is only meaningful where let units exist.
        totals: computeTotals(sectionRows, sectionColumns.map((c) => c.field), {
          includeVariance: isLet,
        }),
        color:
          (sectionRows[0] && statusColor(sectionRows[0])) ||
          STATUS_COLORS[section.statuses[0]] ||
          theme.palette.grey[500],
      }
    })
  }, [data?.columns, filteredRows, theme])

  // Deep-linked unit: derived selection (not effect state) plus an imperative
  // scroll so the row is visible once the grid has mounted its rows. When the
  // building id is available, match the unit name WITHIN that building only —
  // unit names are not unique across properties (e.g. "First Floor").
  const urlMatch = useMemo(() => {
    if (!unitParam) return undefined
    const name = unitParam.toLowerCase()
    if (buildingIdParam) {
      const bid = Number(buildingIdParam)
      const inBuilding = filteredRows.find(
        (row) =>
          cellText(row, 'unit_name').toLowerCase() === name &&
          row.metadata?.raw_unit?.building_id != null &&
          Number(row.metadata.raw_unit.building_id) === bid
      )
      if (inBuilding) return inBuilding
    }
    return filteredRows.find((row) => cellText(row, 'unit_name').toLowerCase() === name)
  }, [unitParam, buildingIdParam, filteredRows])
  const rowSelectionModel: GridRowSelectionModel =
    selectionOverride ?? { type: 'include', ids: new Set(urlMatch?.id != null ? [urlMatch.id] : []) }

  useEffect(() => {
    if (!urlMatch) return
    const index = filteredRows.indexOf(urlMatch)
    // Wait a tick for the grid to mount/measure rows before scrolling to it.
    requestAnimationFrame(() => apiRef.current?.scrollToIndexes?.({ rowIndex: index }))
  }, [urlMatch, filteredRows, apiRef])

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 1 }}>
        <Typography variant="h5">Units</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 240 }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_e, value) => value && setView(value)}
          >
            <ToggleButton value="classic">Classic view</ToggleButton>
            <ToggleButton value="state">By status</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {String(error)}
        </Alert>
      )}
      {/* Temporary: show raw API shape until column mapping is confirmed */}
      {!isLoading && rows.length === 0 && !error && (
        <Box
          component="pre"
          sx={(muiTheme) => ({
            fontSize: 12,
            overflowX: 'auto',
            mb: 2,
            bgcolor: 'background.paper',
            border: `1px solid ${muiTheme.palette.divider}`,
            borderRadius: 2,
            color: 'text.secondary',
            p: 2,
          })}
        >
          {JSON.stringify(raw, null, 2)}
        </Box>
      )}
      {rows.length > 0 && view === 'classic' && (
        <DataGrid
          apiRef={apiRef}
          rows={filteredRows as GridValidRowModel[]}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          getRowHeight={() => 'auto'}
          getRowClassName={(params) =>
            params.row.metadata?.raw_unit?.remarks ? 'has-remarks' : ''
          }
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={(model) => setSelectionOverride(model)}
          slots={{ footer: () => <TableFooter totals={totals} /> }}
          // Fixed height (not autoHeight): the grid fills the window below the
          // app bar/tabs/page header (~240px) and scrolls internally, so the
          // column headers and pagination footer always stay visible.
          sx={dataGridStyles(theme, 'calc(100dvh - 240px)')}
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
  const theme = useTheme()
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
          bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.22 : 0.14),
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
            // Fixed height for every table: rows scroll internally and the
            // column headers stay pinned. (maxHeight would give short tables
            // no intrinsic height — the grid collapses to 0px.)
            sx={{
              ...dataGridStyles(theme, 'calc(100dvh - 280px)'),
              border: 'none',
            }}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            getRowHeight={() => 'auto'}
            getRowClassName={(params) =>
              params.row.metadata?.raw_unit?.remarks ? 'has-remarks' : ''
            }
            slots={{ footer: () => <TableFooter totals={table.totals} /> }}
          />
        </Box>
      </Collapse>
    </Paper>
  )
}
