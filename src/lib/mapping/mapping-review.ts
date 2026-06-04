import { buildKeywordStats, extractKeyword } from './keyword-stats';
import type { KnowledgeBaseMappingInput, MappingStatus } from '@/lib/types/mapping';

export interface MappingReviewSummary {
  detected: number;
  valid: number;
  ambiguous: number;
  rejected: number;
}

export function prepareMappingReviewRows(rows: KnowledgeBaseMappingInput[], existingRows: KnowledgeBaseMappingInput[] = []): KnowledgeBaseMappingInput[] {
  return rows.map((row) => {
    const keyword = extractKeyword(row);
    const relatedRows = [...existingRows, ...rows].filter((candidate) => candidate.attributeName === row.attributeName && extractKeyword(candidate).toUpperCase() === keyword.toUpperCase());
    const targets = new Set(relatedRows.map((candidate) => candidate.targetValue));
    const needsContext = targets.size > 1 && (row.conditions?.length ?? 0) < 2;
    const confidenceScore = businessConfidenceScore(row, needsContext);
    const status: MappingStatus = row.status === 'rejected' ? 'rejected' : needsContext ? 'needs_context' : row.status === 'validated' ? 'validated' : 'detected';
    return {
      ...row,
      status,
      confidenceScore,
      validationCount: row.validationCount ?? (row.status === 'validated' ? 1 : 0),
      rejectionCount: row.rejectionCount ?? (row.status === 'rejected' ? 1 : 0),
      sourceCount: new Set(relatedRows.map((candidate) => candidate.sourceName ?? '*')).size || 1,
      reason: needsContext
        ? `${keyword} dépend du contexte : valider avec une condition parent.`
        : row.conditions?.length
          ? `Règle contextuelle détectée avec ${row.conditions.length} condition(s).`
          : 'Mapping direct détecté depuis SQL.',
    };
  });
}

export function mappingReviewSummary(rows: KnowledgeBaseMappingInput[]): MappingReviewSummary {
  return {
    detected: rows.length,
    valid: rows.filter((row) => row.status === 'detected' || row.status === 'validated' || row.status === 'suggested').length,
    ambiguous: rows.filter((row) => row.status === 'needs_context' || row.status === 'conflict').length,
    rejected: rows.filter((row) => row.status === 'rejected' || row.status === 'ignored').length,
  };
}

export function buildBusinessKeywordStats(rows: KnowledgeBaseMappingInput[]) {
  return buildKeywordStats(rows);
}

function businessConfidenceScore(row: KnowledgeBaseMappingInput, needsContext: boolean): number {
  if (needsContext) return 0.55;
  const conditionBoost = Math.min((row.conditions?.length ?? 0) * 0.08, 0.18);
  const validationBoost = Math.min((row.validationCount ?? 0) * 0.01, 0.08);
  const rejectionPenalty = Math.min((row.rejectionCount ?? 0) * 0.04, 0.25);
  return Math.max(0.35, Math.min(0.98, 0.76 + conditionBoost + validationBoost - rejectionPenalty));
}
