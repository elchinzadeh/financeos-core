import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getOwnedActiveGoal } from '../goals.utils.js';
import { AbandonGoalCommand } from './abandon-goal.command.js';

@CommandHandler(AbandonGoalCommand)
export class AbandonGoalHandler implements ICommandHandler<AbandonGoalCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AbandonGoalCommand) {
    await getOwnedActiveGoal(this.prisma, command.userId, command.goalId);

    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.update({
        where: { id: command.goalId },
        data: { status: 'abandoned' },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'goal',
          aggregateId: goal.id,
          eventType: 'GoalAbandoned',
          payload: {},
        },
      });

      return goal;
    });
  }
}
