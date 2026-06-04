import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/mapping/normalize';
import type { KnowledgeBaseMappingInput } from '@/lib/types/mapping';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attributeName = searchParams.get('attributeName') ?? undefined;
  const sourceName = searchParams.get('sourceName') ?? undefined;

  try {
    const rows = await prisma.mappingKnowledgeBase.findMany({
      where: {
        status: 'validated',
        ...(attributeName ? { attributeName } : {}),
        ...(sourceName ? { sourceName } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return NextResponse.json(rows.map(toKnowledgeBaseInput));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { mappings?: KnowledgeBaseMappingInput[] };
  const mappings = (body.mappings ?? []).filter((mapping) => mapping.attributeName && mapping.sourceValue && mapping.targetValue);

  try {
    const saved = [];
    for (const mapping of mappings) {
      const row = await prisma.mappingKnowledgeBase.upsert({
        where: {
          source_attribute_source_value_unique: {
            sourceName: mapping.sourceName ?? '*',
            attributeName: mapping.attributeName,
            sourceValueNormalized: normalizeText(mapping.sourceValue),
          },
        },
        update: {
          sourceValue: mapping.sourceValue,
          targetValue: mapping.targetValue,
          sourcePath: mapping.sourcePath,
          matcherType: mapping.matcherType ?? 'exact',
          family: mapping.family,
          sport: mapping.sport,
          category: mapping.category,
          brand: mapping.brand,
          gender: mapping.gender,
          confidenceScore: mapping.confidenceScore ?? 1,
          status: mapping.status ?? 'validated',
          validationCount: { increment: 1 },
        },
        create: {
          sourceName: mapping.sourceName ?? '*',
          attributeName: mapping.attributeName,
          sourceValue: mapping.sourceValue,
          sourceValueNormalized: normalizeText(mapping.sourceValue),
          targetValue: mapping.targetValue,
          sourcePath: mapping.sourcePath,
          matcherType: mapping.matcherType ?? 'exact',
          family: mapping.family,
          sport: mapping.sport,
          category: mapping.category,
          brand: mapping.brand,
          gender: mapping.gender,
          confidenceScore: mapping.confidenceScore ?? 1,
          status: mapping.status ?? 'validated',
          validationCount: 1,
        },
      });
      saved.push(row);

      await prisma.suggestionMemory.upsert({
        where: {
          attributeName_sourceValueNormalized: {
            attributeName: mapping.attributeName,
            sourceValueNormalized: normalizeText(mapping.sourceValue),
          },
        },
        update: { targetValue: mapping.targetValue, usageCount: { increment: 1 }, lastUsedAt: new Date() },
        create: {
          attributeName: mapping.attributeName,
          sourceValueNormalized: normalizeText(mapping.sourceValue),
          targetValue: mapping.targetValue,
          usageCount: 1,
        },
      });
    }

    return NextResponse.json(saved.map(toKnowledgeBaseInput), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to save mappings in mapping_knowledge_base' }, { status: 500 });
  }
}

function toKnowledgeBaseInput(row: {
  id?: string;
  sourceName?: string;
  attributeName: string;
  sourceValue: string;
  targetValue: string;
  sourcePath?: string | null;
  matcherType?: 'exact' | 'regex' | 'contains';
  family?: string | null;
  sport?: string | null;
  category?: string | null;
  brand?: string | null;
  gender?: string | null;
  confidenceScore?: number;
  status?: 'draft' | 'validated' | 'rejected';
  validationCount?: number;
}): KnowledgeBaseMappingInput {
  return {
    id: row.id,
    sourceName: row.sourceName === '*' ? undefined : row.sourceName,
    attributeName: row.attributeName,
    sourceValue: row.sourceValue,
    targetValue: row.targetValue,
    sourcePath: row.sourcePath ?? undefined,
    matcherType: row.matcherType,
    family: row.family ?? undefined,
    sport: row.sport ?? undefined,
    category: row.category ?? undefined,
    brand: row.brand ?? undefined,
    gender: row.gender ?? undefined,
    confidenceScore: row.confidenceScore,
    status: row.status,
    validationCount: row.validationCount,
  };
}
