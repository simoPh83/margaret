import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface UnitCell {
  display: string;
  sort_value?: string | number | null;
  /** Cell metadata shipped by the API (e.g. widget_spec.color for status cells). */
  metadata?: { widget_spec?: { color?: string } };
}

/** Subset of the raw unit record returned in row.metadata.raw_unit. */
export interface RawUnit {
  building_id?: number | null;
  property_name?: string | null;
  formatted_address?: string | null;
  remarks?: string | null;
  [key: string]: unknown;
}

export interface UnitRow {
  id?: string | number;
  cells?: Record<string, UnitCell>;
  metadata?: { raw_unit?: RawUnit };
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

/** Human-readable building name: property_name, falling back to the address cell. */
export function buildingLabel(row: UnitRow): string {
  const raw = row.metadata?.raw_unit;
  return (
    raw?.property_name ||
    row.cells?.property?.display ||
    raw?.formatted_address ||
    (raw?.building_id != null ? `Building ${raw.building_id}` : 'Unknown building')
  );
}

/** Street address of the building, stripping any leading-zero artifact (e.g. "001 …" → "1 …"). */
export function buildingAddress(row: UnitRow): string {
  const raw = row.metadata?.raw_unit;
  const display = row.cells?.property?.display;
  const address = raw?.formatted_address ?? '';
  if (!address) return '';
  const withoutZeros = address.replace(/^0+(?=\d)/, '');
  // Prefer the API's cleaned display when it matches the same address.
  if (display && withoutZeros.toLowerCase().startsWith(display.toLowerCase())) {
    return address;
  }
  return withoutZeros;
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
