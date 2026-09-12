import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getOwnedActiveAccount } from '../accounts.utils.js';
import { ArchiveAccountCommand } from './archive-account.command.js';

@CommandHandler(ArchiveAccountCommand)
export class ArchiveAccountHandler implements ICommandHandler<ArchiveAccountCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ArchiveAccountCommand) {
    await getOwnedActiveAccount(this.prisma, command.userId, command.accountId);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.update({
        where: { id: command.accountId },
        data: { isActive: false },
      });

      await tx.event.create({
        data: {
          userId: command.userId,
          clientId: command.clientId,
          aggregateType: 'account',
          aggregateId: account.id,
          eventType: 'AccountArchived',
          payload: {},
        },
      });

      return account;
    });
  }
}
