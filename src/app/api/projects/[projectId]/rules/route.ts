import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/mapping/normalize';

export async function PATCH(request: Request, { params }: { params: { projectId: string } }) {
  const body = (await request.json()) as { ruleId?: string; targetValue?: string; changedBy?: string };
  if (!body.ruleId || !body.targetValue) {
    return NextResponse.json({ error: 'ruleId and targetValue are required' }, { status: 400 });
  }

  const existing = await prisma.mappingRule.findFirst({ where: { id: body.ruleId, projectId: params.projectId }, include: { project: true } });
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const updated = await prisma.mappingRule.update({
    where: { id: existing.id },
    data: {
      targetValue: body.targetValue,
      status: 'validated',
      history: {
        create: {
          oldTargetValue: existing.targetValue,
          newTargetValue: body.targetValue,
          changedBy: body.changedBy ?? 'mapping-assistant',
        },
      },
    },
  });

  await prisma.suggestionMemory.upsert({
    where: {
      attributeName_sourceValueNormalized: {
        attributeName: existing.project.attributeName,
        sourceValueNormalized: normalizeText(existing.sourceValue),
      },
    },
    update: { targetValue: body.targetValue, usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: {
      attributeName: existing.project.attributeName,
      sourceValueNormalized: normalizeText(existing.sourceValue),
      targetValue: body.targetValue,
      usageCount: 1,
    },
  });

  return NextResponse.json(updated);
}
