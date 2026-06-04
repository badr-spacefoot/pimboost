import type { MappingRuleInput, RuleTestResult, SourceRecord } from '@/lib/types/mapping';
import { getValueByPath } from './paths';
import { escapeRegex } from './normalize';

export function testRules(records: SourceRecord[], fieldPath: string, rules: MappingRuleInput[]): RuleTestResult {
  const activeRules = rules.filter((rule) => rule.targetValue.trim() && rule.sourceValue.trim());
  const examplesByTarget: Record<string, SourceRecord[]> = {};
  const unmatchedExamples: SourceRecord[] = [];
  const conflicts: RuleTestResult['conflicts'] = [];
  let matched = 0;

  for (const record of records) {
    const value = String(getValueByPath(record, fieldPath) ?? '');
    const matchedRules = activeRules.filter((rule) => ruleMatches(value, rule));
    const matchedTargets = [...new Set(matchedRules.map((rule) => rule.targetValue))];
    if (matchedRules.length > 0) {
      matched += 1;
      for (const target of matchedTargets) {
        examplesByTarget[target] = examplesByTarget[target] ?? [];
        if (examplesByTarget[target].length < 5) examplesByTarget[target].push(record);
      }
    } else if (unmatchedExamples.length < 10) {
      unmatchedExamples.push(record);
    }
    if (matchedTargets.length > 1 || matchedRules.length > 1) {
      conflicts.push({ record, matchedTargets, matchedRules });
    }
  }

  const total = records.length;
  const unmatched = total - matched;
  return {
    total,
    matched,
    unmatched,
    coverage: total === 0 ? 0 : matched / total,
    unmatchedExamples,
    examplesByTarget,
    conflicts,
  };
}

function ruleMatches(value: string, rule: MappingRuleInput): boolean {
  if (rule.matcherType === 'exact') return value.toUpperCase() === rule.sourceValue.toUpperCase();
  if (rule.matcherType === 'contains') return value.toUpperCase().includes(rule.sourceValue.toUpperCase());
  try {
    return new RegExp(rule.sourceValue, 'i').test(value);
  } catch {
    return false;
  }
}

export function buildRegexFromContainsValues(values: string[]): string {
  return values.map(escapeRegex).join('|');
}
