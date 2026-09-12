import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getOwnedBudget } from '../budget.utils.js';
import { UpdateBudgetPriorityCommand } from './update-budget-priority.command.js';

@CommandHandler(UpdateBudgetPriorityCommand)
export class UpdateBudgetPriorityHandler
  implements ICommandHandler<UpdateBudgetPriorityCommand>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateBudgetPriorityCommand) {
    await getOwnedBudget(this.prisma, command.userId, command.budgetId);

    return this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.update({
        where: { id: command.budgetId },
        data: { priority: command.priority },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'budget',
          aggregateId: budget.id,
          eventType: 'BudgetPriorityUpdated',
          payload: { priority: command.priority },
        },
      });

      return budget;
    });
  }
}
