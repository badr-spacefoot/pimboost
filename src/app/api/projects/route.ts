import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/mapping/normalize';
import type { MappingRuleInput } from '@/lib/types/mapping';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    sourceName?: string;
    attributeName?: string;
    rules?: MappingRuleInput[];
  };

  if (!body.name || !body.sourceName || !body.attributeName) {
    return NextResponse.json({ error: 'name, sourceName and attributeName are required' }, { status: 400 });
  }

  const rules = (body.rules ?? []).filter((rule) => rule.sourceValue && rule.targetValue);
  const project = await prisma.mappingProject.create({
    data: {
      name: body.name,
      sourceName: body.sourceName,
      attributeName: body.attributeName,
      rules: {
        create: rules.map((rule) => ({
          sourceValue: rule.sourceValue,
          targetValue: rule.targetValue,
          matcherType: rule.matcherType,
          confidenceScore: rule.confidenceScore ?? 0,
          status: rule.status ?? 'draft',
        })),
      },
    },
    include: { rules: true },
  });

  for (const rule of rules.filter((item) => item.status === 'validated')) {
    await prisma.mappingKnowledgeBase.upsert({
      where: {
        source_attribute_source_value_unique: {
          sourceName: body.sourceName,
          attributeName: body.attributeName,
          sourceValueNormalized: normalizeText(rule.sourceValue),
        },
      },
      update: {
        sourceValue: rule.sourceValue,
        targetValue: rule.targetValue,
        confidenceScore: rule.confidenceScore ?? 1,
        status: 'validated',
        validationCount: { increment: 1 },
      },
      create: {
        sourceName: body.sourceName,
        attributeName: body.attributeName,
        sourceValue: rule.sourceValue,
        sourceValueNormalized: normalizeText(rule.sourceValue),
        targetValue: rule.targetValue,
        confidenceScore: rule.confidenceScore ?? 1,
        status: 'validated',
        validationCount: 1,
      },
    });

    await prisma.suggestionMemory.upsert({
      where: {
        attributeName_sourceValueNormalized: {
          attributeName: body.attributeName,
          sourceValueNormalized: normalizeText(rule.sourceValue),
        },
      },
      update: {
        targetValue: rule.targetValue,
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        attributeName: body.attributeName,
        sourceValueNormalized: normalizeText(rule.sourceValue),
        targetValue: rule.targetValue,
        usageCount: 1,
      },
    });
  }

  return NextResponse.json(project, { status: 201 });
}

export async function GET() {
  try {
    const projects = await prisma.mappingProject.findMany({ orderBy: { updatedAt: 'desc' }, include: { rules: true } });
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json([]);
  }
}
