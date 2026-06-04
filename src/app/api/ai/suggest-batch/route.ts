import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { suggestTrainingBatch } from '@/lib/mapping/ai-training';
import type { AiSuggestBatchPayload, TrainingExampleInput } from '@/lib/types/mapping';

export async function POST(request: Request) {
  const rawPayload = (await request.json()) as AiSuggestBatchPayload & { source_name?: string; attribute_name?: string; source_path?: string };
  const payload: AiSuggestBatchPayload = {
    ...rawPayload,
    sourceName: rawPayload.sourceName ?? rawPayload.source_name,
    attributeName: rawPayload.attributeName ?? rawPayload.attribute_name ?? '',
    sourcePath: rawPayload.sourcePath ?? rawPayload.source_path,
  };
  if (!payload.attributeName || !Array.isArray(payload.values)) return NextResponse.json({ error: 'attribute_name and values are required' }, { status: 400 });

  try {
    const rows = await prisma.trainingExample.findMany({
      where: {
        status: 'validated',
        OR: [{ attributeName: payload.attributeName }, ...(payload.sourceName ? [{ sourceName: payload.sourceName }] : [])],
      },
      orderBy: [{ validationCount: 'desc' }, { updatedAt: 'desc' }],
      take: 1000,
    });
    const suggestions = suggestTrainingBatch(payload, rows.map((row) => row as TrainingExampleInput));
    return NextResponse.json({
      suggestions: suggestions.map((suggestion) => ({
        ...suggestion,
        source_value: suggestion.sourceValue,
        suggested_target: suggestion.suggestedTarget,
        matcher_type: suggestion.matcherType,
        nearest_examples: suggestion.nearestExamples.map((example) => ({
          source_value: example.sourceValue,
          target_value: example.targetValue,
          similarity: example.similarity,
        })),
      })),
    });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
