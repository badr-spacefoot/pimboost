import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exportKnowledgeBaseCsv, exportKnowledgeBaseJson, exportKnowledgeBaseSql } from '@/lib/mapping/knowledge-base';
import type { KnowledgeBaseMappingInput } from '@/lib/types/mapping';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') ?? 'json';
  const attributeName = searchParams.get('attributeName') ?? undefined;

  try {
    const rows = await prisma.mappingKnowledgeBase.findMany({
      where: { status: 'validated', ...(attributeName ? { attributeName } : {}) },
      orderBy: [{ attributeName: 'asc' }, { sourceValue: 'asc' }],
    });
    const mappings: KnowledgeBaseMappingInput[] = rows.map((row) => ({
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
    }));

    if (format === 'csv') return textResponse(exportKnowledgeBaseCsv(mappings), 'text/csv');
    if (format === 'sql') return textResponse(exportKnowledgeBaseSql(mappings, attributeName ?? mappings[0]?.attributeName ?? 'raw_data'), 'text/plain');
    return textResponse(exportKnowledgeBaseJson(mappings), 'application/json');
  } catch {
    return textResponse(format === 'json' ? '[]' : '', format === 'csv' ? 'text/csv' : 'text/plain');
  }
}

function textResponse(body: string, contentType: string) {
  return new NextResponse(body, { headers: { 'Content-Type': `${contentType}; charset=utf-8` } });
}
