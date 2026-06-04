import Papa from 'papaparse';
import type { SourceRecord } from '@/lib/types/mapping';

export async function parseSourceFile(file: File): Promise<SourceRecord[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json') || file.type.includes('json')) {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed as SourceRecord[];
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const firstArray = Object.values(record).find(Array.isArray);
      if (Array.isArray(firstArray)) return firstArray as SourceRecord[];
      return [record];
    }
    return [];
  }
  return new Promise((resolve, reject) => {
    Papa.parse<SourceRecord>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (result) => resolve(result.data),
      error: reject,
    });
  });
}
