import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CategoriesService } from '../../categories/categories.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateBudgetCommand } from './create-budget.command.js';

@CommandHandler(CreateBudgetCommand)
export class CreateBudgetHandler implements ICommandHandler<CreateBudgetCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async execute(command: CreateBudgetCommand) {
    const totalPercent = command.allocations.reduce((sum, a) => sum + a.percent, 0);
    if (totalPercent > 100) {
      throw new BadRequestException('Allocation faizlərinin cəmi 100-dən çox ola bilməz');
    }

    for (const allocation of command.allocations) {
      await this.categoriesService.getAccessibleCategory(
        command.userId,
        allocation.categoryId,
        'expense',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.create({
        data: {
          userId: command.userId,
          name: command.name,
          source: command.source,
          definition: { allocations: command.allocations } as unknown as Prisma.InputJsonValue,
          priority: command.priority,
          activeFrom: new Date(command.activeFrom),
          activeTo: command.activeTo ? new Date(command.activeTo) : undefined,
        },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'budget',
          aggregateId: budget.id,
          eventType: 'BudgetCreated',
          payload: {
            name: budget.name,
            source: budget.source,
            allocations: command.allocations,
            priority: budget.priority,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return budget;
    });
  }
}
