import Papa from 'papaparse';
import { normalizeText } from './normalize';
import { generateCaseWhenSql } from './sql';
import type { KnowledgeBaseImportPreview, KnowledgeBaseMappingInput, MappingRuleInput } from '@/lib/types/mapping';

const REQUIRED_COLUMNS = ['attribute_name', 'source_value', 'target_value'];
const OPTIONAL_COLUMNS = ['source_name', 'family', 'sport', 'category', 'brand', 'gender', 'confidence_score', 'status'];

export async function parseKnowledgeBaseFile(file: File): Promise<KnowledgeBaseMappingInput[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json') || file.type.includes('json')) {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Le JSON de mappings doit être un tableau.');
    return parsed.map((row) => normalizeKnowledgeBaseRow(row as Record<string, unknown>));
  }

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (result) => resolve(result.data.map(normalizeKnowledgeBaseRow)),
      error: reject,
    });
  });
}

export function normalizeKnowledgeBaseRow(row: Record<string, unknown>): KnowledgeBaseMappingInput {
  return {
    sourceName: optionalString(row.source_name),
    attributeName: stringValue(row.attribute_name),
    sourceValue: stringValue(row.source_value),
    targetValue: stringValue(row.target_value),
    family: optionalString(row.family),
    sport: optionalString(row.sport),
    category: optionalString(row.category),
    brand: optionalString(row.brand),
    gender: optionalString(row.gender),
    confidenceScore: numberValue(row.confidence_score, 1),
    status: row.status === 'draft' || row.status === 'rejected' ? row.status : 'validated',
  };
}

export function buildKnowledgeBasePreview(
  rows: KnowledgeBaseMappingInput[],
  existingRows: KnowledgeBaseMappingInput[] = [],
): KnowledgeBaseImportPreview {
  const existingByKey = new Map(existingRows.map((row) => [knowledgeBaseKey(row), row]));
  const firstTargetByAttributeSource = new Map<string, string>();
  const duplicates = new Set<string>();
  const conflicts: KnowledgeBaseImportPreview['conflicts'] = [];
  const enrichedRows = rows.map((row, index) => {
    const errors = validateKnowledgeBaseRow(row);
    const rowKey = knowledgeBaseKey(row);
    const conflictKey = `${row.attributeName}:${normalizeText(row.sourceValue)}`;
    const previousTarget = firstTargetByAttributeSource.get(conflictKey);
    const existing = existingByKey.get(rowKey);

    if (rows.findIndex((candidate) => knowledgeBaseKey(candidate) === rowKey) !== index) duplicates.add(rowKey);
    if (previousTarget && previousTarget !== row.targetValue) {
      conflicts.push({ index, sourceValue: row.sourceValue, attributeName: row.attributeName, existingTargetValue: previousTarget, importedTargetValue: row.targetValue });
    } else {
      firstTargetByAttributeSource.set(conflictKey, row.targetValue);
    }
    if (existing && existing.targetValue !== row.targetValue) {
      conflicts.push({ index, sourceValue: row.sourceValue, attributeName: row.attributeName, existingTargetValue: existing.targetValue, importedTargetValue: row.targetValue });
    }

    return { row, errors, duplicate: duplicates.has(rowKey), existing: Boolean(existing) };
  });

  return {
    total: rows.length,
    valid: enrichedRows.filter((row) => row.errors.length === 0).length,
    invalid: enrichedRows.filter((row) => row.errors.length > 0).length,
    duplicates: enrichedRows.filter((row) => row.duplicate).length,
    existing: enrichedRows.filter((row) => row.existing).length,
    newMappings: enrichedRows.filter((row) => !row.existing && row.errors.length === 0).length,
    conflicts,
    rows: enrichedRows,
  };
}

export function exportKnowledgeBaseCsv(rows: KnowledgeBaseMappingInput[]): string {
  return Papa.unparse(rows.map((row) => ({
    source_name: row.sourceName ?? '',
    attribute_name: row.attributeName,
    source_value: row.sourceValue,
    target_value: row.targetValue,
    family: row.family ?? '',
    sport: row.sport ?? '',
    category: row.category ?? '',
    brand: row.brand ?? '',
    gender: row.gender ?? '',
    confidence_score: row.confidenceScore ?? 1,
    status: row.status ?? 'validated',
  })));
}

export function exportKnowledgeBaseJson(rows: KnowledgeBaseMappingInput[]): string {
  return JSON.stringify(rows, null, 2);
}

export function exportKnowledgeBaseSql(rows: KnowledgeBaseMappingInput[], sourceExpression: string): string {
  const rules: MappingRuleInput[] = rows
    .filter((row) => row.sourceValue && row.targetValue)
    .map((row) => ({ sourceValue: row.sourceValue, targetValue: row.targetValue, matcherType: 'contains', confidenceScore: row.confidenceScore ?? 1, status: 'validated' }));
  return generateCaseWhenSql(sourceExpression, rules).sql;
}

export function knowledgeBaseKey(row: KnowledgeBaseMappingInput): string {
  return `${row.sourceName ?? '*'}:${row.attributeName}:${normalizeText(row.sourceValue)}`;
}

export function validateKnowledgeBaseRow(row: KnowledgeBaseMappingInput): string[] {
  return REQUIRED_COLUMNS.flatMap((column) => {
    const value = row[camelCase(column) as keyof KnowledgeBaseMappingInput];
    return typeof value === 'string' && value.trim() ? [] : [`Colonne obligatoire manquante : ${column}`];
  });
}

export function knowledgeBaseColumns(): { required: string[]; optional: string[] } {
  return { required: REQUIRED_COLUMNS, optional: OPTIONAL_COLUMNS };
}

function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function optionalString(value: unknown): string | undefined {
  const normalized = stringValue(value);
  return normalized || undefined;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
