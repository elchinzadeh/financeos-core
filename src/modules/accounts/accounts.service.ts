import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getOwnedActiveAccount } from './accounts.utils.js';
import { ArchiveAccountCommand } from './commands/archive-account.command.js';
import { OpenAccountCommand } from './commands/open-account.command.js';
import { OpenAccountDto } from './dto/open-account.dto.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async open(userId: string, clientId: string, dto: OpenAccountDto) {
    return this.commandBus.execute(
      new OpenAccountCommand(userId, clientId, dto.name, dto.type, dto.currency, dto.accountGroup),
    );
  }

  async archive(userId: string, clientId: string, accountId: string) {
    return this.commandBus.execute(new ArchiveAccountCommand(userId, clientId, accountId));
  }

  async list(userId: string, includeArchived: boolean) {
    return this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { isActive: true }) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getWithBalance(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Hesab tapılmadı');
    }
    const balance = await this.prisma.accountBalance.findUnique({ where: { accountId } });
    return { ...account, balance: balance?.balance ?? '0' };
  }

  /** Ledger modulunun komanda handler-ləri üçün: hesab mövcuddur, cari istifadəçiyə aiddir və aktivdir. */
  async getOwnedActiveAccount(userId: string, accountId: string) {
    return getOwnedActiveAccount(this.prisma, userId, accountId);
  }
}
