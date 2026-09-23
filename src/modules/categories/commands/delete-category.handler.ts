import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DeleteCategoryCommand } from './delete-category.command.js';

@CommandHandler(DeleteCategoryCommand)
export class DeleteCategoryHandler implements ICommandHandler<DeleteCategoryCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteCategoryCommand) {
    const category = await this.prisma.category.findUnique({
      where: { id: command.categoryId },
      include: { children: { select: { id: true } } },
    });
    if (!category || category.userId !== command.userId) {
      throw new NotFoundException('Kateqoriya tapılmadı');
    }
    if (category.children.length > 0) {
      throw new BadRequestException('Əvvəlcə alt-kateqoriyaları silin və ya başqa yerə köçürün');
    }

    if (command.strategy === 'reassign') {
      if (!command.targetCategoryId) {
        throw new BadRequestException('Yenidən təyin üçün hədəf kateqoriya lazımdır');
      }
      const target = await this.prisma.category.findUnique({
        where: { id: command.targetCategoryId },
      });
      if (
        !target ||
        target.userId !== command.userId ||
        target.kind !== category.kind ||
        target.id === category.id
      ) {
        throw new BadRequestException('Hədəf kateqoriya yanlışdır');
      }
    }

    const affectedEntries = await this.prisma.ledgerEntry.findMany({
      where: { categoryId: category.id },
      select: { accountId: true },
    });
    const affectedAccountIds = [...new Set(affectedEntries.map((e) => e.accountId))];
    const needsBalanceRecompute = command.strategy === 'delete' || command.strategy === 'archive';

    await this.prisma.$transaction(async (tx) => {
      if (command.strategy === 'reassign') {
        await tx.ledgerEntry.updateMany({
          where: { categoryId: category.id },
          data: { categoryId: command.targetCategoryId },
        });
      } else if (command.strategy === 'uncategorize') {
        await tx.ledgerEntry.updateMany({
          where: { categoryId: category.id },
          data: { categoryId: null },
        });
      } else if (command.strategy === 'archive') {
        await tx.ledgerEntry.updateMany({
          where: { categoryId: category.id },
          data: { archivedAt: new Date() },
        });
      } else {
        await tx.ledgerEntry.deleteMany({ where: { categoryId: category.id } });
      }

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'ledger',
          aggregateId: category.id,
          eventType: 'CategoryDeleted',
          payload: {
            categoryName: category.name,
            strategy: command.strategy,
            targetCategoryId: command.targetCategoryId ?? null,
            affectedCount: affectedEntries.length,
          },
        },
      });

      await tx.categorySuggestionRule.deleteMany({ where: { categoryId: category.id } });
      // Kateqoriya silinəndə `ledger_entries.category_id` (ON DELETE SET NULL) qalan istinadları
      // avtomatik boşaldır — "archive" strategiyasında bunu bilərəkdən yuxarıda əl ilə etmirik.
      await tx.category.delete({ where: { id: category.id } });

      if (needsBalanceRecompute) {
        for (const accountId of affectedAccountIds) {
          await recomputeBalance(tx, accountId);
        }
      }
    });

    return { strategy: command.strategy, affectedCount: affectedEntries.length };
  }
}

async function recomputeBalance(tx: Prisma.TransactionClient, accountId: string): Promise<void> {
  const [creditSum, debitSum] = await Promise.all([
    tx.ledgerEntry.aggregate({
      where: { accountId, direction: 'credit', archivedAt: null },
      _sum: { amount: true },
    }),
    tx.ledgerEntry.aggregate({
      where: { accountId, direction: 'debit', archivedAt: null },
      _sum: { amount: true },
    }),
  ]);
  const balance = (creditSum._sum.amount ?? new Prisma.Decimal(0)).sub(
    debitSum._sum.amount ?? new Prisma.Decimal(0),
  );
  await tx.accountBalance.upsert({
    where: { accountId },
    create: { accountId, balance, updatedAt: new Date() },
    update: { balance, updatedAt: new Date() },
  });
}
