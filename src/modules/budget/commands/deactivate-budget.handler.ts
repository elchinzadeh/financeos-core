import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getOwnedBudget } from '../budget.utils.js';
import { DeactivateBudgetCommand } from './deactivate-budget.command.js';

@CommandHandler(DeactivateBudgetCommand)
export class DeactivateBudgetHandler implements ICommandHandler<DeactivateBudgetCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeactivateBudgetCommand) {
    const existing = await getOwnedBudget(this.prisma, command.userId, command.budgetId);
    if (existing.activeTo && existing.activeTo.getTime() <= Date.now()) {
      throw new BadRequestException('Büdcə artıq deaktivdir');
    }

    const today = new Date(new Date().toISOString().slice(0, 10));

    return this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.update({
        where: { id: command.budgetId },
        data: { activeTo: today },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'budget',
          aggregateId: budget.id,
          eventType: 'BudgetDeactivated',
          payload: {},
        },
      });

      return budget;
    });
  }
}
