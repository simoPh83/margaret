import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface UnitCell {
  display: string;
  sort_value?: string | number | null;
}

export interface UnitRow {
  id?: string | number;
  cells?: Record<string, UnitCell>;
}

/** Shared fetch + shape-normalization for the units table. Cached by React Query. */
export function useUnits() {
  return useQuery({
    queryKey: ['units', 'table'],
    queryFn: () => apiFetch('/api/units/table-data').then((r) => r.json()),
    retry: false,
    select: (data) => {
      const tableData = data?.table_data ?? data;
      const rows: UnitRow[] = Array.isArray(tableData)
        ? tableData
        : (tableData?.rows ?? tableData?.data ?? []);
      const columns: { field: string; headerName: string }[] = tableData?.columns ?? [];
      return { rows, columns, raw: data };
    },
  });
}

/** Parse a numeric value from a cell (prefers sort_value, falls back to display text). */
export function cellNumber(row: UnitRow, field: string): number {
  const cell = row.cells?.[field];
  if (!cell) return 0;
  if (typeof cell.sort_value === 'number') return cell.sort_value;
  const n = parseFloat(String(cell.sort_value ?? cell.display).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function cellText(row: UnitRow, field: string): string {
  return row.cells?.[field]?.display ?? '';
}

/** Find a column's field name by fuzzy-matching its header (e.g. "Rent PA"). */
export function findField(
  columns: { field: string; headerName: string }[],
  ...patterns: RegExp[]
): string | undefined {
  return columns.find((col) =>
    patterns.some((p) => p.test(col.headerName) || p.test(col.field))
  )?.field;
}
