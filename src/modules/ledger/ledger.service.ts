import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
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
      ),
    );
  }

  async transfer(userId: string, clientId: string, dto: TransferDto) {
    return this.commandBus.execute(
      new TransferBetweenAccountsCommand(
        userId,
        clientId,
        dto.fromAccountId,
        dto.toAccountId,
        dto.amount,
        dto.occurredAt,
        dto.note,
      ),
    );
  }

  async adjustBalance(userId: string, clientId: string, dto: AdjustBalanceDto) {
    return this.commandBus.execute(
      new AdjustBalanceCommand(userId, clientId, dto.accountId, dto.delta, dto.occurredAt, dto.note),
    );
  }

  async listEntries(userId: string, accountId?: string) {
    return this.prisma.ledgerEntry.findMany({
      where: { account: { userId }, ...(accountId ? { accountId } : {}) },
      orderBy: { occurredAt: 'desc' },
    });
  }
}
