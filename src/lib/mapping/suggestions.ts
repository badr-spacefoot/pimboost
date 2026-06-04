import type { MappingSuggestion, SuggestionMemoryEntry } from '@/lib/types/mapping';
import { normalizeText } from './normalize';

export const SEED_SUGGESTIONS: SuggestionMemoryEntry[] = [
  ['SNAPBACK', 'Casquette snapback'],
  ['TRUCKER', 'Casquette trucker'],
  ['SWIMSUIT', 'Maillot de bain 1 pièce'],
  ['BATHING SUIT', 'Maillot de bain 1 pièce'],
  ['BIKINI TOP', 'Haut de maillot de bain'],
  ['BANDEAU BIKINI', 'Haut de maillot de bain'],
  ['TRIANGLE BIKINI', 'Bas de maillot de bain'],
  ['BIKINI BOTTOM', 'Bas de maillot de bain'],
  ['BRA', 'Brassière'],
  ['BOXER SHORTS', 'Boxer'],
  ['TEE', 'T-shirt'],
  ['T-SHIRT', 'T-shirt'],
  ['TSHIRT', 'T-shirt'],
  ['HOODY', 'Sweatshirt à capuche'],
  ['HOODIE', 'Sweatshirt à capuche'],
  ['CREWNECK', 'Sweatshirt'],
  ['SWEATSHIRT', 'Sweatshirt'],
].map(([sourceValueNormalized, targetValue]) => ({
  attributeName: '*',
  sourceValueNormalized,
  targetValue,
  usageCount: 1,
}));

export function suggestMapping(
  sourceValue: string,
  attributeName: string,
  memory: SuggestionMemoryEntry[] = SEED_SUGGESTIONS,
): MappingSuggestion {
  const normalized = normalizeText(sourceValue);
  const relevantMemory = memory.filter((entry) => entry.attributeName === attributeName || entry.attributeName === '*');
  const exact = relevantMemory.find((entry) => entry.sourceValueNormalized === normalized);
  if (exact) return { targetValue: exact.targetValue, confidenceScore: 1, reason: 'memory' };

  const bestSimilarity = relevantMemory
    .map((entry) => ({ entry, score: similarity(normalized, entry.sourceValueNormalized) }))
    .sort((a, b) => b.score - a.score)[0];
  if (bestSimilarity && bestSimilarity.score >= 0.78) {
    return { targetValue: bestSimilarity.entry.targetValue, confidenceScore: 0.8, reason: 'similarity' };
  }

  const keyword = relevantMemory.find((entry) => normalized.includes(entry.sourceValueNormalized) || entry.sourceValueNormalized.includes(normalized));
  if (keyword && normalized.length >= 3) {
    return { targetValue: keyword.targetValue, confidenceScore: 0.5, reason: 'keyword' };
  }

  return { targetValue: '', confidenceScore: 0, reason: 'none' };
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}
