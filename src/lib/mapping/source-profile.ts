import { normalizeText } from './normalize';
import type { SourceRecord, SuggestionMemoryEntry, TypologyDetection } from '@/lib/types/mapping';

const TYPOLOGY_KEYWORDS: Array<{ label: string; keywords: string[] }> = [
  { label: 'Sport / Running', keywords: ['RUNNING', 'RUNNER', 'JOGGING', 'MARATHON', 'TRAIL'] },
  { label: 'Sport / Football', keywords: ['FOOTBALL', 'SOCCER', 'FUTSAL', 'CLEATS', 'CRAMPONS'] },
  { label: 'Sport / Training', keywords: ['TRAINING', 'WORKOUT', 'FITNESS', 'GYM', 'CROSSFIT'] },
  { label: 'Sport / Yoga', keywords: ['YOGA', 'PILATES', 'LEGGING', 'MAT'] },
  { label: 'Sport / Natation', keywords: ['SWIM', 'SWIMSUIT', 'BATHING SUIT', 'BIKINI', 'BOARD SHORT'] },
  { label: 'Outdoor / Randonnée', keywords: ['OUTDOOR', 'HIKING', 'TREK', 'TRAIL', 'MOUNTAIN'] },
  { label: 'Streetwear / Casquettes', keywords: ['SNAPBACK', 'TRUCKER', 'CAP', 'CASQUETTE', 'STREETWEAR'] },
  { label: 'Mode / Underwear', keywords: ['BRA', 'BOXER', 'UNDERWEAR', 'LINGERIE', 'BRASSIERE'] },
  { label: 'Mode / Sweatshirts', keywords: ['HOODY', 'HOODIE', 'CREWNECK', 'SWEATSHIRT'] },
  { label: 'Mode / T-shirts', keywords: ['TEE', 'T-SHIRT', 'TSHIRT', 'T SHIRT'] },
];

export function parseManualMappings(
  input: string,
  attributeName: string,
  sourceName: string,
): SuggestionMemoryEntry[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitMappingLine(line))
    .filter((mapping): mapping is { sourceValue: string; targetValue: string } => Boolean(mapping?.sourceValue && mapping.targetValue))
    .map((mapping) => ({
      attributeName,
      sourceName,
      sourceValueNormalized: normalizeText(mapping.sourceValue),
      targetValue: mapping.targetValue.trim(),
      usageCount: 1,
      reason: 'source-history',
    }));
}

export function detectSourceTypologies(records: SourceRecord[], limit = 300): TypologyDetection[] {
  const normalizedCorpus = normalizeText(records.slice(0, limit).map((record) => collectPrimitiveValues(record)).flat().join(' '));
  if (!normalizedCorpus) return [];

  return TYPOLOGY_KEYWORDS.map((typology) => {
    const matchedKeywords = typology.keywords.filter((keyword) => normalizedCorpus.includes(keyword));
    const confidenceScore = matchedKeywords.length / typology.keywords.length;
    return { label: typology.label, matchedKeywords, confidenceScore };
  })
    .filter((typology) => typology.matchedKeywords.length > 0)
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.matchedKeywords.length - a.matchedKeywords.length)
    .slice(0, 6);
}

function splitMappingLine(line: string): { sourceValue: string; targetValue: string } | undefined {
  const separator = ['=>', ';', ',', '|'].find((candidate) => line.includes(candidate));
  if (!separator) return undefined;
  const [sourceValue, ...targetParts] = line.split(separator);
  const targetValue = targetParts.join(separator);
  if (!sourceValue?.trim() || !targetValue?.trim()) return undefined;
  return { sourceValue: sourceValue.trim(), targetValue: targetValue.trim() };
}

function collectPrimitiveValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (['string', 'number', 'boolean'].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectPrimitiveValues(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap((item) => collectPrimitiveValues(item));
  return [];
}
