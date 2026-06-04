import { normalizeText } from './normalize';
import { similarity } from './suggestions';
import type { AiSuggestion, AiSuggestBatchPayload, KnowledgeBaseMappingInput, TrainingExampleInput, TrainingStats } from '@/lib/types/mapping';

const EMBEDDING_DIMENSIONS = 48;

export function knowledgeBaseToTrainingExample(row: KnowledgeBaseMappingInput): TrainingExampleInput {
  return {
    sourceName: row.sourceName,
    attributeName: row.attributeName,
    sourcePath: row.sourcePath,
    sourceValue: row.sourceValue,
    targetValue: row.targetValue,
    family: row.family,
    sport: row.sport,
    category: row.category,
    brand: row.brand,
    gender: row.gender,
    matcherType: row.matcherType ?? 'exact',
    confidenceScore: row.confidenceScore ?? 1,
    status: row.status ?? 'validated',
    validationCount: row.validationCount ?? 1,
    rejectionCount: 0,
  };
}

export function buildTrainingTextRepresentation(example: TrainingExampleInput): string {
  return [
    example.sourceName,
    example.attributeName,
    example.sourcePath,
    example.sourceValue,
    example.family,
    example.sport,
    example.category,
    example.brand,
    example.gender,
    example.targetValue,
  ]
    .filter(Boolean)
    .join(' ');
}

export function createLocalEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = Array<number>(dimensions).fill(0);
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const index = positiveHash(token) % dimensions;
    vector[index] += 1;
    for (let i = 0; i < token.length - 2; i += 1) {
      vector[positiveHash(token.slice(i, i + 3)) % dimensions] += 0.35;
    }
  }
  return normalizeVector(vector);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function suggestTrainingBatch(payload: AiSuggestBatchPayload, examples: TrainingExampleInput[]): AiSuggestion[] {
  return payload.values.map((sourceValue) => suggestOne(sourceValue, payload, examples));
}

export function summarizeTrainingExamples(examples: TrainingExampleInput[]): TrainingStats {
  const bySource = countBy(examples, (example) => example.sourceName ?? '*');
  const byAttribute = countBy(examples, (example) => example.attributeName);
  const bySport = countBy(examples, (example) => example.sport ?? '*');
  const byFamily = countBy(examples, (example) => example.family ?? '*');
  const reliable = [...examples]
    .sort((a, b) => (b.validationCount ?? 0) - (a.validationCount ?? 0) || (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0))
    .slice(0, 10);
  const rejected = [...examples].sort((a, b) => (b.rejectionCount ?? 0) - (a.rejectionCount ?? 0)).filter((example) => (example.rejectionCount ?? 0) > 0).slice(0, 10);
  return { total: examples.length, bySource, byAttribute, bySport, byFamily, reliable, rejected };
}

export function exportTrainingJsonl(examples: TrainingExampleInput[]): string {
  return examples
    .filter((example) => example.status === 'validated')
    .map((example) => JSON.stringify({ input: buildTrainingInput(example), output: example.targetValue }))
    .join('\n');
}

export function embeddingToPgVector(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(6))).join(',')}]`;
}

function suggestOne(sourceValue: string, payload: AiSuggestBatchPayload, examples: TrainingExampleInput[]): AiSuggestion {
  const sourceEmbedding = createLocalEmbedding(buildTrainingTextRepresentation({
    sourceName: payload.sourceName,
    attributeName: payload.attributeName,
    sourcePath: payload.sourcePath,
    sourceValue,
    targetValue: '',
    brand: payload.context?.brand,
    sport: payload.context?.sport,
    category: payload.context?.category,
    family: payload.context?.family,
    gender: payload.context?.gender,
  }));

  const scored = examples
    .filter((example) => example.status === 'validated')
    .map((example) => {
      const semanticSimilarity = cosineSimilarity(sourceEmbedding, createLocalEmbedding(buildTrainingTextRepresentation(example)));
      const textSimilarity = similarity(normalizeText(sourceValue), normalizeText(example.sourceValue));
      const exact = normalizeText(sourceValue) === normalizeText(example.sourceValue) ? 1 : 0;
      const contains = normalizeText(sourceValue).includes(normalizeText(example.sourceValue)) || normalizeText(example.sourceValue).includes(normalizeText(sourceValue)) ? 1 : 0;
      const sourceBoost = payload.sourceName && example.sourceName === payload.sourceName ? 0.08 : 0;
      const attributeBoost = example.attributeName === payload.attributeName ? 0.08 : 0;
      const pathBoost = payload.sourcePath && example.sourcePath === payload.sourcePath ? 0.07 : 0;
      const brandBoost = payload.context?.brand && example.brand === payload.context.brand ? 0.04 : 0;
      const sportBoost = payload.context?.sport && example.sport === payload.context.sport ? 0.04 : 0;
      const categoryBoost = payload.context?.category && example.category === payload.context.category ? 0.04 : 0;
      const genderBoost = payload.context?.gender && example.gender === payload.context.gender ? 0.03 : 0;
      const familyBoost = payload.context?.family && example.family === payload.context.family ? 0.04 : 0;
      const validationBoost = Math.min((example.validationCount ?? 0) * 0.01, 0.08);
      const rejectionPenalty = Math.min((example.rejectionCount ?? 0) * 0.04, 0.25);
      const rawScore = exact * 0.5 + contains * 0.18 + textSimilarity * 0.2 + semanticSimilarity * 0.24 + sourceBoost + attributeBoost + pathBoost + brandBoost + sportBoost + categoryBoost + genderBoost + familyBoost + validationBoost - rejectionPenalty;
      return { example, semanticSimilarity, textSimilarity, score: clamp(rawScore) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return { sourceValue, suggestedTarget: '', confidence: 0, matcherType: 'semantic', reason: 'No validated training examples available.', nearestExamples: [], status: 'draft' };
  }

  const nearestExamples = scored.slice(0, 3).map((candidate) => ({
    sourceValue: candidate.example.sourceValue,
    targetValue: candidate.example.targetValue,
    similarity: Number(candidate.score.toFixed(2)),
  }));

  return {
    sourceValue,
    suggestedTarget: best.example.targetValue,
    confidence: Number(best.score.toFixed(2)),
    matcherType: 'semantic',
    reason: best.score >= 0.95
      ? `Exact or near-exact validated mapping for ${best.example.sourceName ?? '*'} / ${best.example.attributeName}`
      : `Nearest validated examples: ${nearestExamples.map((example) => `${example.sourceValue} → ${example.targetValue}`).join(', ')}`,
    nearestExamples,
    status: 'draft',
  };
}

function buildTrainingInput(example: TrainingExampleInput): string {
  return [
    `source=${example.sourceName ?? ''}`,
    `attribute=${example.attributeName}`,
    example.sourcePath ? `path=${example.sourcePath}` : undefined,
    `value=${example.sourceValue}`,
    example.category ? `category=${example.category}` : undefined,
    example.sport ? `sport=${example.sport}` : undefined,
    example.brand ? `brand=${example.brand}` : undefined,
  ].filter(Boolean).join('; ');
}

function countBy(examples: TrainingExampleInput[], getKey: (example: TrainingExampleInput) => string): Record<string, number> {
  return examples.reduce<Record<string, number>>((acc, example) => {
    const key = getKey(example);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function positiveHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => value / norm) : vector;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, value));
}
