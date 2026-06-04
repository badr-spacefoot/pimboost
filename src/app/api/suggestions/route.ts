import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SEED_SUGGESTIONS } from '@/lib/mapping/suggestions';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attributeName = searchParams.get('attributeName') ?? '*';

  try {
    const suggestions = await prisma.suggestionMemory.findMany({
      where: { OR: [{ attributeName }, { attributeName: '*' }] },
      orderBy: [{ usageCount: 'desc' }, { lastUsedAt: 'desc' }],
    });
    return NextResponse.json(suggestions.length ? suggestions : SEED_SUGGESTIONS);
  } catch {
    return NextResponse.json(SEED_SUGGESTIONS);
  }
}
