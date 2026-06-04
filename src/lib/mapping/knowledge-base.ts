import Papa from 'papaparse';
import { normalizeText } from './normalize';
import { generateCaseWhenSql } from './sql';
import { generateSqlFromKnowledgeRows } from './rule-execution';
import type { KnowledgeBaseImportPreview, KnowledgeBaseMappingInput, MappingCondition, MappingRuleInput } from '@/lib/types/mapping';

const REQUIRED_COLUMNS = ['attribute_name', 'source_value', 'target_value'];
const OPTIONAL_COLUMNS = ['source_name', 'source_path', 'matcher_type', 'rule_type', 'conditions', 'family', 'sport', 'category', 'brand', 'gender', 'confidence_score', 'status'];

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
    sourcePath: optionalString(row.source_path),
    matcherType: row.matcher_type === 'regex' || row.matcher_type === 'contains' ? row.matcher_type : 'exact',
    ruleType: row.rule_type === 'contextual' || row.rule_type === 'regex' || row.rule_type === 'sql_case' ? row.rule_type : 'one_to_one',
    conditions: parseConditions(row.conditions),
    family: optionalString(row.family),
    sport: optionalString(row.sport),
    category: optionalString(row.category),
    brand: optionalString(row.brand),
    gender: optionalString(row.gender),
    confidenceScore: numberValue(row.confidence_score, 1),
    status: ['detected', 'suggested', 'validated', 'rejected', 'ignored', 'conflict', 'needs_context', 'draft'].includes(String(row.status)) ? row.status as KnowledgeBaseMappingInput['status'] : 'validated',
  };
}

export function buildKnowledgeBasePreview(
  rows: KnowledgeBaseMappingInput[],
  existingRows: KnowledgeBaseMappingInput[] = [],
): KnowledgeBaseImportPreview {
  const existingByKey = new Map(existingRows.map((row) => [knowledgeBaseKey(row), row]));
  const firstTargetByContext = new Map<string, string>();
  const duplicates = new Set<string>();
  const conflicts: KnowledgeBaseImportPreview['conflicts'] = [];
  const enrichedRows = rows.map((row, index) => {
    const errors = validateKnowledgeBaseRow(row);
    const rowKey = knowledgeBaseKey(row);
    const conflictKey = contextualConflictKey(row);
    const previousTarget = firstTargetByContext.get(conflictKey);
    const existing = existingByKey.get(rowKey);

    if (rows.findIndex((candidate) => knowledgeBaseKey(candidate) === rowKey) !== index) duplicates.add(rowKey);
    if (previousTarget && previousTarget !== row.targetValue) {
      conflicts.push({ index, sourceValue: row.sourceValue, attributeName: row.attributeName, conditions: row.conditions, existingTargetValue: previousTarget, importedTargetValue: row.targetValue });
    } else {
      firstTargetByContext.set(conflictKey, row.targetValue);
    }
    if (existing && existing.targetValue !== row.targetValue) {
      conflicts.push({ index, sourceValue: row.sourceValue, attributeName: row.attributeName, conditions: row.conditions, existingTargetValue: existing.targetValue, importedTargetValue: row.targetValue });
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
    source_path: row.sourcePath ?? '',
    matcher_type: row.matcherType ?? 'exact',
    rule_type: row.ruleType ?? 'one_to_one',
    conditions: row.conditions?.map((condition) => `${condition.sourcePath} ${condition.operator} ${condition.value}`).join(' AND ') ?? '',
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
  const contextualRows = rows.filter((row) => row.conditions?.length || row.status === 'validated');
  if (contextualRows.some((row) => row.conditions?.length)) return generateSqlFromKnowledgeRows(contextualRows, sourceExpression);
  const rules: MappingRuleInput[] = rows
    .filter((row) => row.status === 'validated' && row.sourceValue && row.targetValue)
    .map((row) => ({ sourceValue: row.sourceValue, targetValue: row.targetValue, matcherType: row.matcherType ?? 'contains', confidenceScore: row.confidenceScore ?? 1, status: 'validated' }));
  return generateCaseWhenSql(sourceExpression, rules).sql;
}

export function knowledgeBaseKey(row: KnowledgeBaseMappingInput): string {
  return `${row.sourceName ?? '*'}:${row.attributeName}:${conditionSignature(row)}:${normalizeText(row.sourceValue)}`;
}

export function contextualConflictKey(row: KnowledgeBaseMappingInput): string {
  return `${row.sourceName ?? '*'}:${row.attributeName}:${conditionSignature(row) || normalizeText(row.sourceValue)}`;
}

export function conditionSignature(row: KnowledgeBaseMappingInput): string {
  if (!row.conditions?.length) return '';
  return [...row.conditions]
    .map((condition) => `${condition.sourcePath}:${condition.operator}:${normalizeText(condition.value)}:${condition.conditionGroup ?? 'default'}`)
    .sort()
    .join('|');
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

function parseConditions(value: unknown): MappingCondition[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value as MappingCondition[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed as MappingCondition[];
    } catch {
      return undefined;
    }
  }
  return undefined;
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
