import { normalizeText } from './normalize';
import { conditionSignature } from './rule-execution';
import type { KeywordStatSummary, KnowledgeBaseMappingInput } from '@/lib/types/mapping';

export function buildKeywordStats(rows: KnowledgeBaseMappingInput[]): KeywordStatSummary[] {
  const groups = new Map<string, KnowledgeBaseMappingInput[]>();
  for (const row of rows) {
    const keyword = extractKeyword(row);
    if (!keyword) continue;
    const key = `${row.attributeName}:${normalizeText(keyword)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()].map((items) => summarizeKeyword(items)).sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export function keywordNeedsContext(rows: KnowledgeBaseMappingInput[], keyword: string): boolean {
  const normalized = normalizeText(keyword);
  const matchingRows = rows.filter((row) => normalizeText(extractKeyword(row)) === normalized);
  if (matchingRows.length < 2) return false;
  const targets = new Set(matchingRows.map((row) => row.targetValue));
  const contexts = new Set(matchingRows.map((row) => conditionSignature(row.conditions ?? [])));
  return targets.size > 1 && contexts.size > 1;
}

export function extractKeyword(row: KnowledgeBaseMappingInput): string {
  const regexCondition = row.conditions?.find((condition) => condition.operator === '~*' || condition.operator === 'contains');
  return regexCondition?.value || row.sourceValue;
}

function summarizeKeyword(items: KnowledgeBaseMappingInput[]): KeywordStatSummary {
  const first = items[0];
  const keyword = extractKeyword(first);
  const validationCount = items.reduce((count, row) => count + (row.status === 'validated' ? row.validationCount ?? 1 : 0), 0);
  const rejectionCount = items.reduce((count, row) => count + (row.status === 'rejected' ? row.rejectionCount ?? 1 : row.rejectionCount ?? 0), 0);
  const sourceCount = new Set(items.map((row) => row.sourceName ?? '*')).size;
  const targetCounts = new Map<string, number>();
  for (const row of items) targetCounts.set(row.targetValue, (targetCounts.get(row.targetValue) ?? 0) + (row.validationCount ?? 1));
  const targets = [...targetCounts.entries()].map(([targetValue, count]) => ({ targetValue, count })).sort((a, b) => b.count - a.count);
  const contextRequired = keywordNeedsContext(items, keyword);
  const total = validationCount + rejectionCount;
  const confidenceScore = contextRequired ? 0.55 : total === 0 ? 0.5 : validationCount / total;
  const reliability = contextRequired ? 'context_required' : confidenceScore >= 0.85 ? 'high' : confidenceScore >= 0.65 ? 'medium' : 'low';
  return {
    keyword,
    keywordNormalized: normalizeText(keyword),
    attributeName: first.attributeName,
    sourceName: first.sourceName,
    contextSignature: [...new Set(items.map((row) => conditionSignature(row.conditions ?? [])).filter(Boolean))].join(' || ') || undefined,
    validationCount,
    rejectionCount,
    sourceCount,
    confidenceScore,
    targetValueMostFrequent: targets[0]?.targetValue,
    targets,
    reliability,
    reason: contextRequired ? `${keyword} dépend du contexte parent : ne pas proposer seul.` : `Target la plus fréquente : ${targets[0]?.targetValue ?? '—'}`,
  };
}
