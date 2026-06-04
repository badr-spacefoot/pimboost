import type { FieldPath, SourceRecord } from '@/lib/types/mapping';

const MAX_ARRAY_ITEMS_TO_EXPLORE = 3;

export function flattenFieldPaths(records: SourceRecord[]): FieldPath[] {
  const paths = new Set<string>();
  for (const record of records.slice(0, 50)) {
    collectPaths(record, '', paths);
  }
  return [...paths].sort().map((label) => ({ label, sqlExpression: toPostgresExpression(label) }));
}

function collectPaths(value: unknown, prefix: string, paths: Set<string>): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.slice(0, MAX_ARRAY_ITEMS_TO_EXPLORE).forEach((item, index) => collectPaths(item, `${prefix}[${index}]`, paths));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      if (child !== null && typeof child === 'object') {
        collectPaths(child, next, paths);
      } else {
        paths.add(next);
      }
    });
    return;
  }
  if (prefix) paths.add(prefix);
}

export function getValueByPath(record: SourceRecord, path: string): unknown {
  const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
  let current: unknown = record;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (token.startsWith('[')) {
      const index = Number(token.slice(1, -1));
      current = Array.isArray(current) ? current[index] : undefined;
    } else {
      current = typeof current === 'object' ? (current as Record<string, unknown>)[token] : undefined;
    }
  }
  return current;
}

export function toPostgresExpression(path: string): string {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const [root, ...rest] = parts;
  if (rest.length === 1) return `${root}->>'${rest[0]}'`;
  return `${root}#>>'{${rest.join(',')}}'`;
}
