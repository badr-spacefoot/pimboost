import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/lib/mapping/normalize';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { buildKnowledgeBasePreview, exportKnowledgeBaseCsv } from '@/lib/mapping/knowledge-base';
import { parseManualMappings, detectSourceTypologies } from '@/lib/mapping/source-profile';
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

  it('prioritizes existing mappings from the same source', () => {
    const suggestion = suggestMapping(
      'snapback',
      'raw_data.name',
      [
        {
          attributeName: 'raw_data.name',
          sourceName: 'supplier-a.json',
          sourceValueNormalized: 'SNAPBACK',
          targetValue: 'Casquette source A',
          usageCount: 1,
          reason: 'source-history',
        },
        {
          attributeName: '*',
          sourceValueNormalized: 'SNAPBACK',
          targetValue: 'Casquette snapback',
          usageCount: 1,
        },
      ],
      'supplier-a.json',
    );

    expect(suggestion).toEqual({
      targetValue: 'Casquette source A',
      confidenceScore: 1,
      reason: 'source-history',
    });
  });
});


describe('source profile helpers', () => {
  it('parses manual source mappings into source-history memory entries', () => {
    expect(parseManualMappings('RUNNING => Running\nYOGA; Yoga', 'raw_data.theme', 'supplier-a')).toEqual([
      {
        attributeName: 'raw_data.theme',
        sourceName: 'supplier-a',
        sourceValueNormalized: 'RUNNING',
        targetValue: 'Running',
        usageCount: 1,
        reason: 'source-history',
      },
      {
        attributeName: 'raw_data.theme',
        sourceName: 'supplier-a',
        sourceValueNormalized: 'YOGA',
        targetValue: 'Yoga',
        usageCount: 1,
        reason: 'source-history',
      },
    ]);
  });

  it('detects likely sport and theme typologies from imported source records', () => {
    const typologies = detectSourceTypologies([
      { raw_data: { name: 'Trail running shoes', category: 'Outdoor mountain' } },
      { raw_data: { name: 'Yoga legging', category: 'Training fitness' } },
    ]);

    expect(typologies.map((typology) => typology.label)).toContain('Sport / Running');
    expect(typologies.map((typology) => typology.label)).toContain('Sport / Yoga');
    expect(typologies.map((typology) => typology.label)).toContain('Outdoor / Randonnée');
  });
});


describe('knowledge base import helpers', () => {
  it('summarizes valid, invalid, duplicate and conflicting one-to-one mappings', () => {
    const preview = buildKnowledgeBasePreview([
      { sourceName: 'Nike', attributeName: 'family', sourceValue: 'SNAPBACK', targetValue: 'Casquette snapback' },
      { sourceName: 'Nike', attributeName: 'family', sourceValue: 'SNAPBACK', targetValue: 'Casquette classique' },
      { sourceName: 'Puma', attributeName: 'family', sourceValue: '', targetValue: 'Casquette trucker' },
    ]);

    expect(preview.total).toBe(3);
    expect(preview.valid).toBe(2);
    expect(preview.invalid).toBe(1);
    expect(preview.duplicates).toBe(1);
    expect(preview.conflicts).toHaveLength(1);
  });

  it('exports one-to-one mappings as CSV', () => {
    const csv = exportKnowledgeBaseCsv([
      { sourceName: 'Adidas', attributeName: 'family', sourceValue: 'TEE', targetValue: 'T-shirt' },
    ]);

    expect(csv).toContain('source_name,attribute_name,source_value,target_value');
    expect(csv).toContain('Adidas,family,TEE,T-shirt');
  });
});
