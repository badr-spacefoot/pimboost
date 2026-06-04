import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/mapping/normalize';

export async function POST(request: Request) {
  const rawBody = (await request.json()) as {
    action?: 'accept' | 'reject' | 'modify';
    sourceName?: string;
    source_name?: string;
    attributeName?: string;
    attribute_name?: string;
    sourcePath?: string;
    source_path?: string;
    sourceValue?: string;
    source_value?: string;
    targetValue?: string;
    target_value?: string;
    correctedTargetValue?: string;
    corrected_target_value?: string;
  };
  const body = {
    action: rawBody.action,
    sourceName: rawBody.sourceName ?? rawBody.source_name,
    attributeName: rawBody.attributeName ?? rawBody.attribute_name,
    sourcePath: rawBody.sourcePath ?? rawBody.source_path,
    sourceValue: rawBody.sourceValue ?? rawBody.source_value,
    targetValue: rawBody.targetValue ?? rawBody.target_value,
    correctedTargetValue: rawBody.correctedTargetValue ?? rawBody.corrected_target_value,
  };
  if (!body.action || !body.attributeName || !body.sourceValue) return NextResponse.json({ error: 'action, attributeName and sourceValue are required' }, { status: 400 });

  try {
    const targetValue = body.correctedTargetValue || body.targetValue || '';
    const existing = await prisma.trainingExample.findFirst({
      where: { sourceName: body.sourceName, attributeName: body.attributeName, sourceValueNormalized: normalizeText(body.sourceValue), targetValue: body.targetValue || targetValue },
    });
    if (existing) {
      const updated = await prisma.trainingExample.update({
        where: { id: existing.id },
        data: body.action === 'reject'
          ? { rejectionCount: { increment: 1 }, status: 'rejected' }
          : { targetValue, validationCount: { increment: 1 }, status: 'validated' },
      });
      return NextResponse.json(updated);
    }

    const created = await prisma.trainingExample.create({
      data: {
        sourceName: body.sourceName,
        attributeName: body.attributeName,
        sourcePath: body.sourcePath,
        sourceValue: body.sourceValue,
        sourceValueNormalized: normalizeText(body.sourceValue),
        targetValue,
        matcherType: 'exact',
        confidenceScore: body.action === 'reject' ? 0 : 1,
        status: body.action === 'reject' ? 'rejected' : 'validated',
        validationCount: body.action === 'reject' ? 0 : 1,
        rejectionCount: body.action === 'reject' ? 1 : 0,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save feedback' }, { status: 500 });
  }
}
