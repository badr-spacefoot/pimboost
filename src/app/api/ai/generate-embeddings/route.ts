import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildTrainingTextRepresentation, createLocalEmbedding, embeddingToPgVector } from '@/lib/mapping/ai-training';
import type { TrainingExampleInput } from '@/lib/types/mapping';

export async function POST() {
  try {
    const rows = await prisma.trainingExample.findMany({ orderBy: [{ updatedAt: 'desc' }], take: 1000 });
    let generated = 0;
    for (const row of rows) {
      const example = row as TrainingExampleInput;
      const textRepresentation = buildTrainingTextRepresentation(example);
      const embedding = embeddingToPgVector(createLocalEmbedding(textRepresentation));
      await prisma.$executeRawUnsafe(
        'INSERT INTO training_embeddings (id, training_example_id, embedding, text_representation, created_at) VALUES ($1, $2, $3::vector, $4, now())',
        `emb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        row.id,
        embedding,
        textRepresentation,
      );
      generated += 1;
    }
    return NextResponse.json({ generated, model: 'local-hash-embedding-compatible-with-all-MiniLM-L6-v2-slot' });
  } catch {
    return NextResponse.json({ error: 'Unable to generate embeddings. Ensure pgvector extension and training_embeddings exist.' }, { status: 500 });
  }
}
