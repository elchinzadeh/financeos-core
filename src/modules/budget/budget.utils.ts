import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Büdcə mövcuddur və cari istifadəçiyə aiddir. */
export async function getOwnedBudget(prisma: PrismaService, userId: string, budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget || budget.userId !== userId) {
    throw new NotFoundException('Büdcə tapılmadı');
  }
  return budget;
}
