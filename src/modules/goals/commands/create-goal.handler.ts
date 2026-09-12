import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccountsService } from '../../accounts/accounts.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateGoalCommand } from './create-goal.command.js';

@CommandHandler(CreateGoalCommand)
export class CreateGoalHandler implements ICommandHandler<CreateGoalCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async execute(command: CreateGoalCommand) {
    const targetAmount = new Prisma.Decimal(command.targetAmount);
    if (!targetAmount.isPositive()) {
      throw new BadRequestException('Hədəf məbləği müsbət olmalıdır');
    }

    if (command.linkedAccountId) {
      await this.accountsService.getOwnedActiveAccount(command.userId, command.linkedAccountId);
    }

    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          userId: command.userId,
          name: command.name,
          targetAmount,
          targetCurrency: command.targetCurrency,
          targetDate: command.targetDate ? new Date(command.targetDate) : undefined,
          linkedAccountId: command.linkedAccountId,
        },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'goal',
          aggregateId: goal.id,
          eventType: 'GoalCreated',
          payload: {
            name: goal.name,
            targetAmount: targetAmount.toString(),
            targetCurrency: goal.targetCurrency,
            targetDate: command.targetDate ?? null,
            linkedAccountId: goal.linkedAccountId,
          },
        },
      });

      return goal;
    });
  }
}
