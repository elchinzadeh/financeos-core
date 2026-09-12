import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Hesabın cari istifadəçiyə aid və aktiv olduğunu yoxlayır, əks halda atır. */
export async function getOwnedActiveAccount(
  prisma: PrismaService,
  userId: string,
  accountId: string,
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== userId) {
    throw new NotFoundException('Hesab tapılmadı');
  }
  if (!account.isActive) {
    throw new BadRequestException('Hesab arxivləşdirilib');
  }
  return account;
}
