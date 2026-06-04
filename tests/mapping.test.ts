import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/lib/mapping/normalize';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { buildTrainingTextRepresentation, createLocalEmbedding, exportTrainingJsonl, suggestTrainingBatch } from '@/lib/mapping/ai-training';
import { buildKnowledgeBasePreview, exportKnowledgeBaseCsv } from '@/lib/mapping/knowledge-base';
import { containsSqlCaseSyntax, parseSqlCaseMappings } from '@/lib/mapping/sql-case-parser';
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


describe('manual one-to-one and SQL CASE parsing', () => {
  it('parses only simple one-to-one manual mappings', () => {
    expect(parseManualMappings('BB Caps => Casquette de baseball\nTrucker Caps ; Casquette trucker\nBackpacks, Sac à dos\n5 Panel Caps | Casquette 5 Pannel', 'family', 'Puma B2B')).toEqual([
      { attributeName: 'family', sourceName: 'Puma B2B', sourceValueNormalized: 'BB CAPS', targetValue: 'Casquette de baseball', usageCount: 1, reason: 'source-history' },
      { attributeName: 'family', sourceName: 'Puma B2B', sourceValueNormalized: 'TRUCKER CAPS', targetValue: 'Casquette trucker', usageCount: 1, reason: 'source-history' },
      { attributeName: 'family', sourceName: 'Puma B2B', sourceValueNormalized: 'BACKPACKS', targetValue: 'Sac à dos', usageCount: 1, reason: 'source-history' },
      { attributeName: 'family', sourceName: 'Puma B2B', sourceValueNormalized: '5 PANEL CAPS', targetValue: 'Casquette 5 Pannel', usageCount: 1, reason: 'source-history' },
    ]);
  });

  it('rejects SQL CASE content in the one-to-one manual parser', () => {
    const input = "CASE WHEN raw_data->>'name' = 'BB Caps' THEN 'Casquette de baseball' ELSE CONCAT('x') END";

    expect(containsSqlCaseSyntax(input)).toBe(true);
    expect(parseManualMappings(input, 'family', 'Puma B2B')).toEqual([]);
  });

  it('parses WHEN equality into an exact mapping', () => {
    const preview = parseSqlCaseMappings("WHEN raw_data->'attributes'->'articletype'->0->>'value' = 'BB Caps'\nTHEN 'Casquette de baseball'", 'Puma B2B', 'family');

    expect(preview.mappings[0]).toMatchObject({
      sourceName: 'Puma B2B',
      attributeName: 'family',
      sourcePath: 'raw_data.attributes.articletype[0].value',
      matcherType: 'exact',
      sourceValue: 'BB Caps',
      targetValue: 'Casquette de baseball',
    });
  });

  it('parses WHEN IN into multiple exact mappings', () => {
    const preview = parseSqlCaseMappings("WHEN raw_data->'attributes'->'articletype'->0->>'value' IN ('Trucker Caps', '5 Panel Caps')\nTHEN 'Casquette trucker'", 'Puma B2B', 'family');

    expect(preview.mappings.map((mapping) => mapping.sourceValue)).toEqual(['Trucker Caps', '5 Panel Caps']);
    expect(preview.mappings.every((mapping) => mapping.matcherType === 'exact')).toBe(true);
  });

  it('parses WHEN regex into a regex mapping', () => {
    const preview = parseSqlCaseMappings("WHEN raw_data->'attributes'->'articletype'->0->>'value' ~* 'Backpack'\nTHEN 'Sac à dos'", 'Puma B2B', 'family');

    expect(preview.mappings[0]).toMatchObject({ matcherType: 'regex', sourceValue: 'Backpack', targetValue: 'Sac à dos' });
  });

  it('excludes ELSE CONCAT debug cases from mappings', () => {
    const preview = parseSqlCaseMappings("CASE WHEN raw_data->>'name' = 'BB Caps' THEN 'Casquette de baseball' ELSE CONCAT(raw_data->>'name', ' - debug') END", 'Puma B2B', 'family');

    expect(preview.mappings).toHaveLength(1);
    expect(preview.debugCases[0]).toContain('ELSE CONCAT');
  });
});


describe('AI training helpers', () => {
  it('builds deterministic local embeddings', () => {
    expect(createLocalEmbedding('Puma family BB Caps')).toEqual(createLocalEmbedding('Puma family BB Caps'));
  });

  it('suggests batch targets with hybrid exact/source/attribute scoring', () => {
    const suggestions = suggestTrainingBatch(
      {
        sourceName: 'Puma B2B',
        attributeName: 'family',
        sourcePath: 'raw_data.attributes.articletype[0].value',
        context: { brand: 'Puma', sport: 'Football', category: 'Accessories' },
        values: ['BB Caps', 'Backpacks'],
      },
      [
        { sourceName: 'Puma B2B', attributeName: 'family', sourcePath: 'raw_data.attributes.articletype[0].value', sourceValue: 'BB Caps', targetValue: 'Casquette de baseball', brand: 'Puma', sport: 'Football', category: 'Accessories', status: 'validated', validationCount: 5, rejectionCount: 0 },
        { sourceName: 'Puma B2B', attributeName: 'family', sourcePath: 'raw_data.attributes.articletype[0].value', sourceValue: 'Backpack', targetValue: 'Sac à dos', brand: 'Puma', sport: 'Football', category: 'Accessories', status: 'validated', validationCount: 3, rejectionCount: 0 },
      ],
    );

    expect(suggestions[0].suggestedTarget).toBe('Casquette de baseball');
    expect(suggestions[0].confidence).toBeGreaterThan(0.9);
    expect(suggestions[1].suggestedTarget).toBe('Sac à dos');
  });

  it('exports validated training examples as JSONL', () => {
    const jsonl = exportTrainingJsonl([
      { sourceName: 'Puma B2B', attributeName: 'family', sourceValue: 'BB Caps', targetValue: 'Casquette de baseball', category: 'Accessories', status: 'validated' },
      { sourceName: 'Puma B2B', attributeName: 'family', sourceValue: 'Bad', targetValue: 'Ignored', status: 'rejected' },
    ]);

    expect(jsonl).toContain('{"input":"source=Puma B2B; attribute=family; value=BB Caps; category=Accessories","output":"Casquette de baseball"}');
    expect(jsonl).not.toContain('Ignored');
  });

  it('creates training text representation with source and target context', () => {
    expect(buildTrainingTextRepresentation({ sourceName: 'Puma B2B', attributeName: 'family', sourceValue: 'BB Caps', targetValue: 'Casquette de baseball' })).toContain('Puma B2B family BB Caps Casquette de baseball');
  });
});
