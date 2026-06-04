import type { GeneratedRule, MappingRuleInput } from '@/lib/types/mapping';
import { escapeRegex, escapeSqlLiteral } from './normalize';

export function generateCaseWhenSql(sourceExpression: string, rules: MappingRuleInput[]): GeneratedRule {
  const validRules = rules.filter((rule) => rule.targetValue.trim() && rule.sourceValue.trim());
  const grouped = new Map<string, MappingRuleInput[]>();
  for (const rule of validRules) {
    const key = rule.targetValue.trim();
    grouped.set(key, [...(grouped.get(key) ?? []), rule]);
  }

  const clauses = [...grouped.entries()].map(([targetValue, items]) => {
    const pattern = items.map((item) => matcherToPattern(item)).join('|');
    return { targetValue, pattern, sourceValues: items.map((item) => item.sourceValue) };
  });

  const body = clauses
    .map(
      (clause) =>
        `    WHEN ${sourceExpression} ~* '${escapeSqlLiteral(clause.pattern)}'\n        THEN '${escapeSqlLiteral(clause.targetValue)}'`,
    )
    .join('\n');
  return {
    sql: `CASE\n${body}${body ? '\n' : ''}    ELSE NULL\nEND`,
    clauses,
  };
}

function matcherToPattern(rule: MappingRuleInput): string {
  if (rule.matcherType === 'regex') return rule.sourceValue;
  if (rule.matcherType === 'exact') return `^${escapeRegex(rule.sourceValue)}$`;
  return escapeRegex(rule.sourceValue);
}
