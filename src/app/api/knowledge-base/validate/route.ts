import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildKnowledgeBasePreview } from '@/lib/mapping/knowledge-base';
import { normalizeText } from '@/lib/mapping/normalize';
import type { KnowledgeBaseMappingInput } from '@/lib/types/mapping';

export async function POST(request: Request) {
  const body = (await request.json()) as { mappings?: KnowledgeBaseMappingInput[] };
  const mappings = body.mappings ?? [];

  try {
    const existing = await prisma.mappingKnowledgeBase.findMany({
      where: mappings.length
        ? {
            OR: mappings.map((mapping) => ({
              sourceName: mapping.sourceName ?? '*',
              attributeName: mapping.attributeName,
              sourceValueNormalized: normalizeText(mapping.sourceValue),
            })),
          }
        : { id: '__none__' },
    });
    return NextResponse.json(buildKnowledgeBasePreview(mappings, existing.map((row) => ({
      sourceName: row.sourceName === '*' ? undefined : row.sourceName,
      attributeName: row.attributeName,
      sourceValue: row.sourceValue,
      targetValue: row.targetValue,
      sourcePath: row.sourcePath ?? undefined,
      matcherType: row.matcherType,
      ruleType: row.ruleType,
      conditions: Array.isArray(row.conditions) ? (row.conditions as never) : undefined,
      family: row.family ?? undefined,
      sport: row.sport ?? undefined,
      category: row.category ?? undefined,
      brand: row.brand ?? undefined,
      gender: row.gender ?? undefined,
      confidenceScore: row.confidenceScore,
      status: row.status,
    }))));
  } catch {
    return NextResponse.json(buildKnowledgeBasePreview(mappings));
  }
}
