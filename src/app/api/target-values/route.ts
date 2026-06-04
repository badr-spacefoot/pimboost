import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SEED_SUGGESTIONS } from '@/lib/mapping/suggestions';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attributeName = searchParams.get('attributeName') ?? undefined;

  try {
    const [knowledgeBaseRows, manualRows] = await Promise.all([
      prisma.mappingKnowledgeBase.findMany({
        where: { status: 'validated', ...(attributeName ? { attributeName } : {}) },
        distinct: ['targetValue'],
        orderBy: [{ targetValue: 'asc' }],
        select: { targetValue: true },
      }),
      prisma.targetValue.findMany({
        where: attributeName ? { attributeName } : {},
        orderBy: [{ targetValue: 'asc' }],
        select: { targetValue: true },
      }),
    ]);
    const seededTargets = SEED_SUGGESTIONS.map((suggestion) => suggestion.targetValue);
    const values = Array.from(new Set([...manualRows.map((row) => row.targetValue), ...knowledgeBaseRows.map((row) => row.targetValue), ...seededTargets])).sort((a, b) => a.localeCompare(b));
    return NextResponse.json(values);
  } catch {
    return NextResponse.json(Array.from(new Set(SEED_SUGGESTIONS.map((suggestion) => suggestion.targetValue))).sort((a, b) => a.localeCompare(b)));
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { attributeName?: string; targetValue?: string };
  if (!body.attributeName || !body.targetValue) return NextResponse.json({ error: 'attributeName and targetValue are required' }, { status: 400 });

  try {
    const row = await prisma.targetValue.upsert({
      where: { attributeName_targetValue: { attributeName: body.attributeName, targetValue: body.targetValue } },
      update: { targetValue: body.targetValue },
      create: { attributeName: body.attributeName, targetValue: body.targetValue },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ attributeName: body.attributeName, targetValue: body.targetValue }, { status: 201 });
  }
}
