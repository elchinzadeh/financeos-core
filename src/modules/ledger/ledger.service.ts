import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdjustBalanceCommand } from './commands/adjust-balance.command.js';
import { RecordExpenseCommand } from './commands/record-expense.command.js';
import { RecordIncomeCommand } from './commands/record-income.command.js';
import { TransferBetweenAccountsCommand } from './commands/transfer-between-accounts.command.js';
import { AdjustBalanceDto } from './dto/adjust-balance.dto.js';
import { RecordExpenseDto } from './dto/record-expense.dto.js';
import { RecordIncomeDto } from './dto/record-income.dto.js';
import { TransferDto } from './dto/transfer.dto.js';

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async recordIncome(userId: string, clientId: string, dto: RecordIncomeDto) {
    return this.commandBus.execute(
      new RecordIncomeCommand(
        userId,
        clientId,
        dto.accountId,
        dto.amount,
        dto.categoryId,
        dto.occurredAt,
        dto.note,
        dto.externalRef,
      ),
    );
  }

  async recordExpense(userId: string, clientId: string, dto: RecordExpenseDto) {
    return this.commandBus.execute(
      new RecordExpenseCommand(
        userId,
        clientId,
        dto.accountId,
        dto.amount,
        dto.categoryId,
        dto.occurredAt,
        dto.note,
        dto.externalRef,
      ),
    );
  }

  async transfer(
    userId: string,
    clientId: string,
    dto: TransferDto,
    externalRefs?: { from?: string; to?: string },
  ) {
    return this.commandBus.execute(
      new TransferBetweenAccountsCommand(
        userId,
        clientId,
        dto.fromAccountId,
        dto.toAccountId,
        dto.amount,
        dto.occurredAt,
        dto.note,
        externalRefs,
      ),
    );
  }

  async adjustBalance(userId: string, clientId: string, dto: AdjustBalanceDto) {
    return this.commandBus.execute(
      new AdjustBalanceCommand(userId, clientId, dto.accountId, dto.delta, dto.occurredAt, dto.note),
    );
  }

  async listEntries(userId: string, accountId?: string, includeArchived = false) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        account: { userId },
        ...(accountId ? { accountId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  /**
   * `account_balances`-i `ledger_entries`-dən yenidən hesablayır (ADR-0001/0002-nin
   * "cache həmişə yenidən qurula bilməlidir" prinsipi). Event yaratmır — mövcud faktlardan
   * mövcud cache-i düzəldir, yeni maliyyə hadisəsi deyil.
   */
  async reconcile(userId: string, accountId?: string) {
    const accounts = accountId
      ? [await this.getOwnedAccount(userId, accountId)]
      : await this.prisma.account.findMany({ where: { userId } });

    const results = [];
    for (const account of accounts) {
      const [creditSum, debitSum] = await Promise.all([
        this.prisma.ledgerEntry.aggregate({
          where: { accountId: account.id, direction: 'credit', archivedAt: null },
          _sum: { amount: true },
        }),
        this.prisma.ledgerEntry.aggregate({
          where: { accountId: account.id, direction: 'debit', archivedAt: null },
          _sum: { amount: true },
        }),
      ]);
      const newBalance = (creditSum._sum.amount ?? new Prisma.Decimal(0)).sub(
        debitSum._sum.amount ?? new Prisma.Decimal(0),
      );
      const existing = await this.prisma.accountBalance.findUnique({
        where: { accountId: account.id },
      });
      const previousBalance = existing?.balance ?? new Prisma.Decimal(0);

      await this.prisma.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, balance: newBalance, updatedAt: new Date() },
        update: { balance: newBalance, updatedAt: new Date() },
      });

      results.push({
        accountId: account.id,
        previousBalance: previousBalance.toString(),
        newBalance: newBalance.toString(),
        corrected: !previousBalance.equals(newBalance),
      });
    }
    return results;
  }

  private async getOwnedAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Hesab tapılmadı');
    }
    return account;
  }
}
