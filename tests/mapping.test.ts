import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/lib/mapping/normalize';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { suggestContextualMapping } from '@/lib/mapping/contextual-rules';
import { buildTrainingTextRepresentation, createLocalEmbedding, exportTrainingJsonl, suggestTrainingBatch } from '@/lib/mapping/ai-training';
import { buildKnowledgeBasePreview, exportKnowledgeBaseCsv, exportKnowledgeBaseSql } from '@/lib/mapping/knowledge-base';
import { containsSqlCaseSyntax, parseSqlCaseMappings } from '@/lib/mapping/sql-case-parser';
import { parseManualMappings, detectSourceTypologies } from '@/lib/mapping/source-profile';
import { suggestMapping } from '@/lib/mapping/suggestions';
import { testRules } from '@/lib/mapping/tester';
import { buildKeywordStats, keywordNeedsContext } from '@/lib/mapping/keyword-stats';
import { mappingReviewSummary, prepareMappingReviewRows } from '@/lib/mapping/mapping-review';
import { generateSqlFromKnowledgeRows, testKnowledgeRows, validatedKnowledgeRows } from '@/lib/mapping/rule-execution';
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

describe('contextual SQL CASE mappings', () => {
  it('keeps parent conditions in nested CASE mappings', () => {
    const preview = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Pants' THEN
        CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
      WHEN raw_data->>'model_category' = 'Shorts' THEN
        CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
    END`, 'Puma B2B', 'family');

    expect(preview.mappings).toHaveLength(2);
    expect(preview.mappings[0]).toMatchObject({ targetValue: 'Pantalon chino', ruleType: 'contextual' });
    expect(preview.mappings[0].conditions).toEqual([
      { sourcePath: 'raw_data.model_category', operator: '=', value: 'Pants' },
      { sourcePath: 'raw_data.model_description', operator: '~*', value: 'Chino' },
    ]);
    expect(preview.mappings[1]).toMatchObject({ targetValue: 'Short chino' });
    expect(preview.mappings[1].conditions?.[0]).toMatchObject({ value: 'Shorts' });
  });

  it('suggests Chino Pants and Chino Shorts from contextual conditions', () => {
    const rules = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Pants' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
      WHEN raw_data->>'model_category' = 'Shorts' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
    END`, 'Puma B2B', 'family').mappings;

    expect(suggestContextualMapping({ raw_data: { model_category: 'Pants', model_description: 'Slim chino pant' } }, rules)?.targetValue).toBe('Pantalon chino');
    expect(suggestContextualMapping({ raw_data: { model_category: 'Shorts', model_description: 'Chino bermuda' } }, rules)?.targetValue).toBe('Short chino');
  });

  it('separates Denim Dress, Denim Jacket and Denim Skirt contextual mappings', () => {
    const rules = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Dress' THEN CASE WHEN raw_data->>'model_description' ~* 'Denim' THEN 'Robe denim' END
      WHEN raw_data->>'model_category' = 'Jacket' THEN CASE WHEN raw_data->>'model_description' ~* 'Denim' THEN 'Veste denim' END
      WHEN raw_data->>'model_category' = 'Skirt' THEN CASE WHEN raw_data->>'model_description' ~* 'Denim' THEN 'Jupe denim' END
    END`, 'Puma B2B', 'family').mappings;

    expect(suggestContextualMapping({ raw_data: { model_category: 'Dress', model_description: 'Blue denim' } }, rules)?.targetValue).toBe('Robe denim');
    expect(suggestContextualMapping({ raw_data: { model_category: 'Jacket', model_description: 'Denim jacket' } }, rules)?.targetValue).toBe('Veste denim');
    expect(suggestContextualMapping({ raw_data: { model_category: 'Skirt', model_description: 'Denim skirt' } }, rules)?.targetValue).toBe('Jupe denim');
  });

  it('distinguishes Shirt Dress from Shirt category', () => {
    const rules = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Dress' THEN CASE WHEN raw_data->>'model_description' ~* 'Shirt' THEN 'Robe chemise' END
      WHEN raw_data->>'model_category' = 'Shirt' THEN CASE WHEN raw_data->>'model_description' ~* 'Classic' THEN 'Chemise' END
    END`, 'Puma B2B', 'family').mappings;

    expect(suggestContextualMapping({ raw_data: { model_category: 'Dress', model_description: 'Shirt dress' } }, rules)?.targetValue).toBe('Robe chemise');
    expect(suggestContextualMapping({ raw_data: { model_category: 'Shirt', model_description: 'Classic fit' } }, rules)?.targetValue).toBe('Chemise');
  });

  it('distinguishes Kimono Jacket from Kimono category', () => {
    const rules = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Jacket' THEN CASE WHEN raw_data->>'model_description' ~* 'Kimono' THEN 'Veste kimono' END
      WHEN raw_data->>'model_category' = 'Kimono' THEN CASE WHEN raw_data->>'model_description' ~* 'Printed' THEN 'Kimono' END
    END`, 'Puma B2B', 'family').mappings;

    expect(suggestContextualMapping({ raw_data: { model_category: 'Jacket', model_description: 'Kimono jacket' } }, rules)?.targetValue).toBe('Veste kimono');
    expect(suggestContextualMapping({ raw_data: { model_category: 'Kimono', model_description: 'Printed' } }, rules)?.targetValue).toBe('Kimono');
  });

  it('only reports conflicts when contextual conditions are identical', () => {
    const contextualRows = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Pants' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
      WHEN raw_data->>'model_category' = 'Shorts' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
    END`, 'Puma B2B', 'family').mappings;
    expect(buildKnowledgeBasePreview(contextualRows).conflicts).toHaveLength(0);

    const conflicting = [contextualRows[0], { ...contextualRows[0], targetValue: 'Short chino' }];
    expect(buildKnowledgeBasePreview(conflicting).conflicts).toHaveLength(1);
  });
});


describe('mapping review validation flow', () => {
  const sql = `CASE
    WHEN raw_data->>'model_category' = 'Pants' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
    WHEN raw_data->>'model_category' = 'Shorts' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
  END`;

  it('feeds SQL CASE imports into Mapping Review as detected rows, not saved rows', () => {
    const preview = parseSqlCaseMappings(sql, 'Puma B2B', 'family');

    expect(preview.mappings).toHaveLength(2);
    expect(preview.mappings[0]).toMatchObject({ status: 'detected', ruleType: 'contextual', targetValue: 'Pantalon chino' });
    expect(preview.mappings[0].conditions).toHaveLength(2);
  });

  it('uses only validated review mappings in Rule Builder SQL', () => {
    const reviewRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings.map((row, index) => ({
      ...row,
      status: index === 0 ? 'validated' as const : 'rejected' as const,
    }));

    const generatedSql = generateSqlFromKnowledgeRows(reviewRows, "raw_data->>'model_description'");

    expect(generatedSql).toContain('Pantalon chino');
    expect(generatedSql).not.toContain('Short chino');
  });

  it('does not export rejected mappings', () => {
    const reviewRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings.map((row, index) => ({
      ...row,
      status: index === 0 ? 'validated' as const : 'rejected' as const,
    }));

    const exportedSql = exportKnowledgeBaseSql(reviewRows, "raw_data->>'model_description'");

    expect(exportedSql).toContain('Pantalon chino');
    expect(exportedSql).not.toContain('Short chino');
  });

  it('applies validated contextual rules in Rule Tester', () => {
    const reviewRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings.map((row) => ({ ...row, status: 'validated' as const }));
    const result = testKnowledgeRows([
      { raw_data: { model_category: 'Pants', model_description: 'Slim chino pant' } },
      { raw_data: { model_category: 'Shorts', model_description: 'Chino bermuda' } },
      { raw_data: { model_category: 'Pants', model_description: 'Denim pant' } },
    ], reviewRows, 'raw_data.model_description');

    expect(result.matched).toBe(2);
    expect(result.unmatched).toBe(1);
    expect(result.examplesByTarget['Pantalon chino']).toHaveLength(1);
    expect(result.examplesByTarget['Short chino']).toHaveLength(1);
  });

  it('detects that CHINO is a contextual keyword with multiple targets', () => {
    const reviewRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings.map((row) => ({ ...row, status: 'validated' as const, validationCount: 12 }));
    const stats = buildKeywordStats(reviewRows);

    expect(keywordNeedsContext(reviewRows, 'Chino')).toBe(true);
    expect(stats[0]).toMatchObject({ keyword: 'Chino', reliability: 'context_required' });
    expect(stats[0].targets.map((target) => target.targetValue)).toContain('Pantalon chino');
    expect(stats[0].targets.map((target) => target.targetValue)).toContain('Short chino');
  });

  it('distinguishes contextual non-conflicts from identical-condition conflicts', () => {
    const contextualRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings;
    expect(buildKnowledgeBasePreview(contextualRows).conflicts).toHaveLength(0);

    const conflictingRows = [contextualRows[0], { ...contextualRows[0], targetValue: 'Short chino' }];
    expect(buildKnowledgeBasePreview(conflictingRows).conflicts).toHaveLength(1);
  });

  it('keeps detected and rejected rows out of validated review rows', () => {
    const reviewRows = parseSqlCaseMappings(sql, 'Puma B2B', 'family').mappings.map((row, index) => ({
      ...row,
      status: index === 0 ? 'validated' as const : 'detected' as const,
    }));

    expect(validatedKnowledgeRows(reviewRows)).toHaveLength(1);
  });
});

describe('simplified SQL workflow review', () => {
  it('prepares SQL parser rows as detected review rules with business scores', () => {
    const preview = parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Pants' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
      WHEN raw_data->>'model_category' = 'Shorts' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
    END`, 'Puma B2B', 'family');
    const rows = prepareMappingReviewRows(preview.mappings);
    const summary = mappingReviewSummary(rows);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'detected')).toBe(true);
    expect(rows.every((row) => (row.confidenceScore ?? 0) > 0.9)).toBe(true);
    expect(summary).toEqual({ detected: 2, valid: 2, ambiguous: 0, rejected: 0 });
  });

  it('marks CHINO alone as needs_context when it has multiple targets', () => {
    const rows = prepareMappingReviewRows([
      { sourceName: 'Puma B2B', attributeName: 'family', sourceValue: 'raw_data.model_description ~* Chino', targetValue: 'Pantalon chino', matcherType: 'regex', ruleType: 'contextual', conditions: [{ sourcePath: 'raw_data.model_description', operator: '~*', value: 'Chino' }] },
      { sourceName: 'Puma B2B', attributeName: 'family', sourceValue: 'raw_data.model_description ~* Chino', targetValue: 'Short chino', matcherType: 'regex', ruleType: 'contextual', conditions: [{ sourcePath: 'raw_data.model_description', operator: '~*', value: 'Chino' }] },
    ]);

    expect(rows.every((row) => row.status === 'needs_context')).toBe(true);
    expect(mappingReviewSummary(rows).ambiguous).toBe(2);
  });

  it('keeps Rule Builder and Rule Tester scoped to accepted rules only', () => {
    const rows = prepareMappingReviewRows(parseSqlCaseMappings(`CASE
      WHEN raw_data->>'model_category' = 'Pants' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
      WHEN raw_data->>'model_category' = 'Shorts' THEN CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
    END`, 'Puma B2B', 'family').mappings).map((row, index) => ({ ...row, status: index === 0 ? 'validated' as const : 'rejected' as const }));

    const sql = generateSqlFromKnowledgeRows(rows, "raw_data->>'model_description'");
    const result = testKnowledgeRows([
      { raw_data: { model_category: 'Pants', model_description: 'Slim chino pant' } },
      { raw_data: { model_category: 'Shorts', model_description: 'Chino bermuda' } },
    ], rows, 'raw_data.model_description');

    expect(sql).toContain('Pantalon chino');
    expect(sql).not.toContain('Short chino');
    expect(result.matched).toBe(1);
  });
});
