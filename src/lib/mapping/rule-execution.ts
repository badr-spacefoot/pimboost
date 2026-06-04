import { normalizeText, escapeRegex, escapeSqlLiteral } from './normalize';
import { getValueByPath, toPostgresExpression } from './paths';
import type { KnowledgeBaseMappingInput, MappingCondition, MappingRuleInput, RuleTestResult, SourceRecord } from '@/lib/types/mapping';

export function validatedKnowledgeRows(rows: KnowledgeBaseMappingInput[]): KnowledgeBaseMappingInput[] {
  return rows.filter((row) => row.status === 'validated' && row.targetValue.trim() && (row.conditions?.length || row.sourceValue.trim()));
}

export function conditionSignature(conditions: MappingCondition[] = []): string {
  return [...conditions]
    .map((condition) => `${condition.sourcePath}${condition.operator}${normalizeText(condition.value)}:${condition.conditionGroup ?? 'default'}`)
    .sort()
    .join('|');
}

export function conditionsToHumanLabel(conditions: MappingCondition[] = []): string {
  return conditions.map((condition) => `${condition.sourcePath}${condition.operator}${condition.value}`).join(' AND ');
}

export function generateSqlFromKnowledgeRows(rows: KnowledgeBaseMappingInput[], defaultSourceExpression: string): string {
  const activeRows = validatedKnowledgeRows(rows);
  const body = activeRows
    .map((row) => {
      const conditionSql = row.conditions?.length ? row.conditions.map(conditionToSql).join(' AND ') : singleMappingToSql(row, defaultSourceExpression);
      return `    WHEN ${conditionSql}\n        THEN '${escapeSqlLiteral(row.targetValue)}'`;
    })
    .join('\n');
  return `CASE\n${body}${body ? '\n' : ''}    ELSE NULL\nEND`;
}

export function testKnowledgeRows(records: SourceRecord[], rows: KnowledgeBaseMappingInput[], defaultFieldPath: string): RuleTestResult {
  const activeRows = validatedKnowledgeRows(rows);
  const examplesByTarget: Record<string, SourceRecord[]> = {};
  const unmatchedExamples: SourceRecord[] = [];
  const conflicts: RuleTestResult['conflicts'] = [];
  let matched = 0;

  for (const record of records) {
    const matchedRows = activeRows.filter((row) => knowledgeRowMatches(record, row, defaultFieldPath));
    const matchedTargets = [...new Set(matchedRows.map((row) => row.targetValue))];
    if (matchedRows.length > 0) {
      matched += 1;
      for (const target of matchedTargets) {
        examplesByTarget[target] = examplesByTarget[target] ?? [];
        if (examplesByTarget[target].length < 5) examplesByTarget[target].push(record);
      }
    } else if (unmatchedExamples.length < 10) {
      unmatchedExamples.push(record);
    }
    if (matchedTargets.length > 1) {
      conflicts.push({ record, matchedTargets, matchedRules: matchedRows.map(toRuleInput) });
    }
  }

  const total = records.length;
  return { total, matched, unmatched: total - matched, coverage: total === 0 ? 0 : matched / total, unmatchedExamples, examplesByTarget, conflicts };
}

export function knowledgeRowMatches(record: SourceRecord, row: KnowledgeBaseMappingInput, defaultFieldPath: string): boolean {
  if (row.conditions?.length) return row.conditions.every((condition) => conditionMatches(getValueByPath(record, condition.sourcePath), condition));
  const value = String(getValueByPath(record, row.sourcePath || defaultFieldPath) ?? '');
  if ((row.matcherType ?? 'exact') === 'exact') return normalizeText(value) === normalizeText(row.sourceValue);
  if (row.matcherType === 'regex') {
    try {
      return new RegExp(row.sourceValue, 'i').test(value);
    } catch {
      return false;
    }
  }
  return normalizeText(value).includes(normalizeText(row.sourceValue));
}

function conditionMatches(rawValue: unknown, condition: MappingCondition): boolean {
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (condition.operator === '=') return normalizeText(value) === normalizeText(condition.value);
  if (condition.operator === '~*') {
    try {
      return new RegExp(condition.value, 'i').test(value);
    } catch {
      return false;
    }
  }
  if (condition.operator === 'contains') return normalizeText(value).includes(normalizeText(condition.value));
  if (condition.operator === 'IN') return condition.value.split('|').map(normalizeText).includes(normalizeText(value));
  return false;
}

function conditionToSql(condition: MappingCondition): string {
  const expression = toPostgresExpression(condition.sourcePath);
  if (condition.operator === '=') return `${expression} = '${escapeSqlLiteral(condition.value)}'`;
  if (condition.operator === '~*') return `${expression} ~* '${escapeSqlLiteral(condition.value)}'`;
  if (condition.operator === 'contains') return `${expression} ~* '${escapeSqlLiteral(escapeRegex(condition.value))}'`;
  const values = condition.value.split('|').map((value) => `'${escapeSqlLiteral(value.trim())}'`).join(', ');
  return `${expression} IN (${values})`;
}

function singleMappingToSql(row: KnowledgeBaseMappingInput, defaultSourceExpression: string): string {
  const expression = row.sourcePath ? toPostgresExpression(row.sourcePath) : defaultSourceExpression;
  if ((row.matcherType ?? 'exact') === 'exact') return `${expression} = '${escapeSqlLiteral(row.sourceValue)}'`;
  const pattern = row.matcherType === 'regex' ? row.sourceValue : escapeRegex(row.sourceValue);
  return `${expression} ~* '${escapeSqlLiteral(pattern)}'`;
}

function toRuleInput(row: KnowledgeBaseMappingInput): MappingRuleInput {
  return { sourceValue: row.sourceValue, targetValue: row.targetValue, matcherType: row.matcherType ?? 'contains', confidenceScore: row.confidenceScore, status: row.status === 'validated' ? 'validated' : 'draft' };
}
