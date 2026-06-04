import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/lib/mapping/normalize';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { suggestMapping } from '@/lib/mapping/suggestions';
import { testRules } from '@/lib/mapping/tester';
import type { MappingRuleInput } from '@/lib/types/mapping';

describe('normalizeText', () => {
  it('uppercases, trims, removes accents and collapses spaces', () => {
    expect(normalizeText('  été   snapback  ')).toBe('ETE SNAPBACK');
  });
});

describe('generateCaseWhenSql', () => {
  it('groups same targets and escapes SQL quotes', () => {
    const rule = generateCaseWhenSql("raw_data->>'name'", [
      { sourceValue: 'SNAPBACK', targetValue: "Casquette d'été", matcherType: 'contains' },
      { sourceValue: 'TRUCKER', targetValue: "Casquette d'été", matcherType: 'contains' },
    ]);

    expect(rule.sql).toContain("WHEN raw_data->>'name' ~* 'SNAPBACK|TRUCKER'");
    expect(rule.sql).toContain("THEN 'Casquette d''été'");
  });
});

describe('testRules', () => {
  it('detects matched, unmatched and conflicting records', () => {
    const rules: MappingRuleInput[] = [
      { sourceValue: 'BIKINI', targetValue: 'Haut de maillot de bain', matcherType: 'contains' },
      { sourceValue: 'TOP', targetValue: 'Top', matcherType: 'contains' },
    ];
    const result = testRules(
      [{ name: 'BIKINI TOP' }, { name: 'UNKNOWN' }, { name: 'BIKINI BOTTOM' }],
      'name',
      rules,
    );

    expect(result.total).toBe(3);
    expect(result.matched).toBe(2);
    expect(result.unmatched).toBe(1);
    expect(result.conflicts).toHaveLength(1);
  });
});

describe('suggestMapping', () => {
  it('returns exact memory suggestions with full confidence', () => {
    expect(suggestMapping('snapback', 'category')).toEqual({
      targetValue: 'Casquette snapback',
      confidenceScore: 1,
      reason: 'memory',
    });
  });

  it('returns similarity suggestions', () => {
    const suggestion = suggestMapping('TSHRT', 'category');
    expect(suggestion.targetValue).toBe('T-shirt');
    expect(suggestion.confidenceScore).toBe(0.8);
  });
});
