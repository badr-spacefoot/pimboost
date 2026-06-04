import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { suggestContextualMapping } from '@/lib/mapping/contextual-rules';
import type { KnowledgeBaseMappingInput, SourceRecord } from '@/lib/types/mapping';

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceName?: string; source_name?: string; attributeName?: string; attribute_name?: string; record?: SourceRecord };
  const sourceName = body.sourceName ?? body.source_name;
  const attributeName = body.attributeName ?? body.attribute_name;
  if (!attributeName || !body.record) return NextResponse.json({ error: 'attributeName and record are required' }, { status: 400 });

  try {
    const rows = await prisma.mappingKnowledgeBase.findMany({
      where: {
        status: 'validated',
        attributeName,
        ruleType: 'contextual',
        ...(sourceName ? { sourceName } : {}),
      },
      orderBy: [{ confidenceScore: 'desc' }, { updatedAt: 'desc' }],
    });
    const suggestion = suggestContextualMapping(body.record, rows.map((row) => ({
      sourceName: row.sourceName === '*' ? undefined : row.sourceName,
      attributeName: row.attributeName,
      sourceValue: row.sourceValue,
      targetValue: row.targetValue,
      sourcePath: row.sourcePath ?? undefined,
      matcherType: row.matcherType,
      ruleType: row.ruleType,
      conditions: Array.isArray(row.conditions) ? (row.conditions as never) : undefined,
      confidenceScore: row.confidenceScore,
      status: row.status,
    } satisfies KnowledgeBaseMappingInput)));
    return NextResponse.json({ suggestion });
  } catch {
    return NextResponse.json({ suggestion: undefined });
  }
}
