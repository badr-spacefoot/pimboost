import type { DistinctValue, SourceRecord } from '@/lib/types/mapping';
import { getValueByPath } from './paths';

export function getDistinctValues(records: SourceRecord[], fieldPath: string): DistinctValue[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const raw = getValueByPath(record, fieldPath);
    const value = raw === null || raw === undefined ? '' : String(raw);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
