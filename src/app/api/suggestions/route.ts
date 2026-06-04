import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/mapping/normalize';
import { SEED_SUGGESTIONS } from '@/lib/mapping/suggestions';
import type { SuggestionMemoryEntry } from '@/lib/types/mapping';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attributeName = searchParams.get('attributeName') ?? '*';
  const sourceName = searchParams.get('sourceName') ?? undefined;

  try {
    const [memory, sourceRules, knowledgeBaseRows] = await Promise.all([
      prisma.suggestionMemory.findMany({
        where: { OR: [{ attributeName }, { attributeName: '*' }] },
        orderBy: [{ usageCount: 'desc' }, { lastUsedAt: 'desc' }],
      }),
      sourceName
        ? prisma.mappingRule.findMany({
            where: {
              targetValue: { not: '' },
              status: { in: ['draft', 'validated'] },
              project: { sourceName, attributeName },
            },
            include: { project: true },
            orderBy: [{ updatedAt: 'desc' }],
          })
        : Promise.resolve([]),
      prisma.mappingKnowledgeBase.findMany({
        where: {
          status: 'validated',
          AND: [
            { OR: [{ attributeName }, { attributeName: '*' }] },
            ...(sourceName ? [{ OR: [{ sourceName }, { sourceName: '*' }] }] : []),
          ],
        },
        orderBy: [{ validationCount: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const sourceHistory: SuggestionMemoryEntry[] = sourceRules.map((rule) => ({
      attributeName: rule.project.attributeName,
      sourceName: rule.project.sourceName,
      sourceValueNormalized: normalizeText(rule.sourceValue),
      targetValue: rule.targetValue,
      usageCount: rule.status === 'validated' ? 2 : 1,
      reason: 'source-history',
    }));

    const knowledgeBaseMemory: SuggestionMemoryEntry[] = knowledgeBaseRows.map((row) => ({
      attributeName: row.attributeName,
      sourceName: row.sourceName === '*' ? undefined : row.sourceName,
      sourceValueNormalized: row.sourceValueNormalized,
      targetValue: row.targetValue,
      usageCount: row.validationCount,
      reason: row.sourceName === '*' ? 'memory' : 'source-history',
    }));

    const suggestions = dedupeSuggestions([...sourceHistory, ...knowledgeBaseMemory, ...memory, ...SEED_SUGGESTIONS]);
    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json(SEED_SUGGESTIONS);
  }
}

function dedupeSuggestions(entries: SuggestionMemoryEntry[]): SuggestionMemoryEntry[] {
  const seen = new Set<string>();
  const deduped: SuggestionMemoryEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.sourceName ?? '*'}:${entry.attributeName}:${entry.sourceValueNormalized}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }
  return deduped;
}
