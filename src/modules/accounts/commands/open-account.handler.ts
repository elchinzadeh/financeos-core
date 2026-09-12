import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OpenAccountCommand } from './open-account.command.js';

@CommandHandler(OpenAccountCommand)
export class OpenAccountHandler implements ICommandHandler<OpenAccountCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: OpenAccountCommand) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          userId: command.userId,
          name: command.name,
          type: command.type,
          currency: command.currency,
          accountGroup: command.accountGroup,
        },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'account',
          aggregateId: account.id,
          eventType: 'AccountOpened',
          payload: {
            name: account.name,
            type: account.type,
            currency: account.currency,
            accountGroup: account.accountGroup,
          },
        },
      });

      return account;
    });
  }
}
