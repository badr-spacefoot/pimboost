import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildTrainingTextRepresentation, createLocalEmbedding, embeddingToPgVector, knowledgeBaseToTrainingExample, summarizeTrainingExamples } from '@/lib/mapping/ai-training';
import { normalizeKnowledgeBaseRow } from '@/lib/mapping/knowledge-base';
import { normalizeText } from '@/lib/mapping/normalize';
import type { KnowledgeBaseMappingInput, TrainingExampleInput } from '@/lib/types/mapping';

export async function GET() {
  try {
    const rows = await prisma.trainingExample.findMany({ orderBy: [{ updatedAt: 'desc' }], take: 500 });
    const examples = rows.map(toTrainingExampleInput);
    return NextResponse.json({ examples, stats: summarizeTrainingExamples(examples) });
  } catch {
    return NextResponse.json({ examples: [], stats: summarizeTrainingExamples([]) });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { mappings?: KnowledgeBaseMappingInput[]; rows?: Record<string, unknown>[]; generateEmbeddings?: boolean };
  const importedRows = body.mappings ?? (body.rows ?? []).map(normalizeKnowledgeBaseRow);
  const examples = importedRows.filter((row) => row.sourceValue && row.targetValue && row.attributeName).map(knowledgeBaseToTrainingExample);

  try {
    const saved: TrainingExampleInput[] = [];
    for (const example of examples) {
      const row = await prisma.trainingExample.create({
        data: {
          sourceName: example.sourceName,
          attributeName: example.attributeName,
          sourcePath: example.sourcePath,
          sourceValue: example.sourceValue,
          sourceValueNormalized: normalizeText(example.sourceValue),
          targetValue: example.targetValue,
          family: example.family,
          sport: example.sport,
          category: example.category,
          brand: example.brand,
          gender: example.gender,
          matcherType: example.matcherType ?? 'exact',
          confidenceScore: example.confidenceScore ?? 1,
          status: example.status ?? 'validated',
          validationCount: example.validationCount ?? 1,
          rejectionCount: example.rejectionCount ?? 0,
        },
      });
      const savedExample = toTrainingExampleInput(row);
      saved.push(savedExample);
      if (body.generateEmbeddings) await createEmbeddingRow(savedExample);
    }

    return NextResponse.json({ examples: saved, stats: summarizeTrainingExamples(saved) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save training examples' }, { status: 500 });
  }
}

async function createEmbeddingRow(example: TrainingExampleInput) {
  if (!example.id) return;
  const textRepresentation = buildTrainingTextRepresentation(example);
  const embedding = embeddingToPgVector(createLocalEmbedding(textRepresentation));
  await prisma.$executeRawUnsafe(
    'INSERT INTO training_embeddings (id, training_example_id, embedding, text_representation, created_at) VALUES ($1, $2, $3::vector, $4, now())',
    `emb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    example.id,
    embedding,
    textRepresentation,
  );
}

function toTrainingExampleInput(row: {
  id?: string;
  sourceName?: string | null;
  attributeName: string;
  sourcePath?: string | null;
  sourceValue: string;
  sourceValueNormalized?: string;
  targetValue: string;
  family?: string | null;
  sport?: string | null;
  category?: string | null;
  brand?: string | null;
  gender?: string | null;
  matcherType?: 'exact' | 'regex' | 'contains';
  confidenceScore?: number;
  status?: 'draft' | 'validated' | 'rejected';
  validationCount?: number;
  rejectionCount?: number;
}): TrainingExampleInput {
  return {
    id: row.id,
    sourceName: row.sourceName ?? undefined,
    attributeName: row.attributeName,
    sourcePath: row.sourcePath ?? undefined,
    sourceValue: row.sourceValue,
    sourceValueNormalized: row.sourceValueNormalized,
    targetValue: row.targetValue,
    family: row.family ?? undefined,
    sport: row.sport ?? undefined,
    category: row.category ?? undefined,
    brand: row.brand ?? undefined,
    gender: row.gender ?? undefined,
    matcherType: row.matcherType,
    confidenceScore: row.confidenceScore,
    status: row.status,
    validationCount: row.validationCount,
    rejectionCount: row.rejectionCount,
  };
}
