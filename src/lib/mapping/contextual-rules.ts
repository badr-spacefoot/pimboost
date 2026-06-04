import { getValueByPath } from './paths';
import type { KnowledgeBaseMappingInput, MappingCondition, SourceRecord } from '@/lib/types/mapping';

export function suggestContextualMapping(record: SourceRecord, rules: KnowledgeBaseMappingInput[]): KnowledgeBaseMappingInput | undefined {
  return rules
    .filter((rule) => rule.status !== 'rejected' && rule.conditions?.length)
    .map((rule) => ({ rule, score: contextualRuleScore(record, rule.conditions ?? []) + (rule.ruleType === 'contextual' ? 0.1 : 0) + (rule.confidenceScore ?? 0) * 0.01 }))
    .filter((candidate) => candidate.score >= (candidate.rule.conditions?.length ?? 0))
    .sort((a, b) => b.score - a.score)[0]?.rule;
}

export function contextualRuleMatches(record: SourceRecord, conditions: MappingCondition[]): boolean {
  return conditions.every((condition) => conditionMatches(getValueByPath(record, condition.sourcePath), condition));
}

function contextualRuleScore(record: SourceRecord, conditions: MappingCondition[]): number {
  return conditions.reduce((score, condition) => score + (conditionMatches(getValueByPath(record, condition.sourcePath), condition) ? 1 : -1), 0);
}

function conditionMatches(rawValue: unknown, condition: MappingCondition): boolean {
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (condition.operator === '=') return value.toUpperCase() === condition.value.toUpperCase();
  if (condition.operator === '~*') return new RegExp(condition.value, 'i').test(value);
  if (condition.operator === 'contains') return value.toUpperCase().includes(condition.value.toUpperCase());
  if (condition.operator === 'IN') return condition.value.split('|').map((item) => item.trim().toUpperCase()).includes(value.toUpperCase());
  return false;
}
