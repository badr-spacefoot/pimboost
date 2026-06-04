import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exportTrainingJsonl } from '@/lib/mapping/ai-training';
import type { TrainingExampleInput } from '@/lib/types/mapping';

export async function GET() {
  try {
    const rows = await prisma.trainingExample.findMany({ where: { status: 'validated' }, orderBy: [{ updatedAt: 'desc' }] });
    return new NextResponse(exportTrainingJsonl(rows.map((row) => row as TrainingExampleInput)), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  } catch {
    return new NextResponse('', { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  }
}
