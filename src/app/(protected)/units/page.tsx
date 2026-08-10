'use client'
import { DataGrid, GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import { Box, Typography, Alert } from '@mui/material'
import { useUnits } from '@/lib/units'

export default function UnitsPage() {
  const { data, isLoading, error } = useUnits()
  const rows = data?.rows ?? []
  const raw = data?.raw

  // cells[field].sort_value for correct sorting; cells[field].display for rendering
  const columns: GridColDef[] = (data?.columns ?? []).map(
    (col: { field: string; headerName: string }) => ({
      field: col.field,
      headerName: col.headerName,
      valueGetter: (_value: unknown, row: GridValidRowModel) =>
        row.cells?.[col.field]?.sort_value ?? row.cells?.[col.field]?.display,
      renderCell: (params: { row: GridValidRowModel }) =>
        params.row.cells?.[col.field]?.display,
    })
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
        />
      )}
    </Box>
  )
}
