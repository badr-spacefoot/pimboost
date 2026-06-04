import { PrismaClient } from '@prisma/client';
import { SEED_SUGGESTIONS } from '../src/lib/mapping/suggestions';

const prisma = new PrismaClient();

async function main() {
  for (const suggestion of SEED_SUGGESTIONS) {
    await prisma.suggestionMemory.upsert({
      where: {
        attributeName_sourceValueNormalized: {
          attributeName: suggestion.attributeName,
          sourceValueNormalized: suggestion.sourceValueNormalized,
        },
      },
      update: {
        targetValue: suggestion.targetValue,
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        attributeName: suggestion.attributeName,
        sourceValueNormalized: suggestion.sourceValueNormalized,
        targetValue: suggestion.targetValue,
        usageCount: suggestion.usageCount,
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
