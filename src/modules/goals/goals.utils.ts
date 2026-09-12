import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Hədəf mövcuddur, cari istifadəçiyə aiddir və hələ `active` statusundadır. */
export async function getOwnedActiveGoal(prisma: PrismaService, userId: string, goalId: string) {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal || goal.userId !== userId) {
    throw new NotFoundException('Hədəf tapılmadı');
  }
  if (goal.status !== 'active') {
    throw new BadRequestException(`Hədəf artıq "${goal.status}" statusundadır`);
  }
  return goal;
}
