import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getOwnedActiveGoal } from '../goals.utils.js';
import { CompleteGoalCommand } from './complete-goal.command.js';

@CommandHandler(CompleteGoalCommand)
export class CompleteGoalHandler implements ICommandHandler<CompleteGoalCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CompleteGoalCommand) {
    await getOwnedActiveGoal(this.prisma, command.userId, command.goalId);

    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.update({
        where: { id: command.goalId },
        data: { status: 'completed' },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'goal',
          aggregateId: goal.id,
          eventType: 'GoalCompleted',
          payload: {},
        },
      });

      return goal;
    });
  }
}
