import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccountsService } from '../../accounts/accounts.service.js';
import { CategoriesService } from '../../categories/categories.service.js';
import { CurrencyFxService } from '../../currency-fx/currency-fx.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getUserBaseCurrency, writeLedgerEvent } from '../ledger.utils.js';
import { RecordExpenseCommand } from './record-expense.command.js';

@CommandHandler(RecordExpenseCommand)
export class RecordExpenseHandler implements ICommandHandler<RecordExpenseCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async execute(command: RecordExpenseCommand) {
    const amount = new Prisma.Decimal(command.amount);
    if (!amount.isPositive()) {
      throw new BadRequestException('Xərc məbləği müsbət olmalıdır');
    }

    const account = await this.accountsService.getOwnedActiveAccount(
      command.userId,
      command.accountId,
    );

    if (command.externalRef) {
      const existing = await this.prisma.ledgerEntry.findFirst({
        where: { accountId: account.id, externalRef: command.externalRef },
      });
      if (existing) {
        return existing;
      }
    }
    if (command.categoryId) {
      await this.categoriesService.getAccessibleCategory(
        command.userId,
        command.categoryId,
        'expense',
      );
    }

    const occurredAt = command.occurredAt ? new Date(command.occurredAt) : new Date();
    const baseCurrency = await getUserBaseCurrency(this.prisma, command.userId);
    const fxRateToBase = await this.currencyFxService.getRate(
      account.currency,
      baseCurrency,
      occurredAt,
    );

    const transactionGroupId = randomUUID();
    const { entries } = await writeLedgerEvent(this.prisma, {
      userId: command.userId,
      clientId: command.clientId,
      eventType: 'ExpenseRecorded',
      aggregateId: account.id,
      transactionGroupId,
      payload: {
        accountId: account.id,
        amount: amount.toString(),
        categoryId: command.categoryId ?? null,
        occurredAt: occurredAt.toISOString(),
        note: command.note ?? null,
      },
      entries: [
        {
          accountId: account.id,
          categoryId: command.categoryId,
          amount,
          direction: 'debit',
          currency: account.currency,
          fxRateToBase,
          occurredAt,
          note: command.note,
          externalRef: command.externalRef,
        },
      ],
    });

    return entries[0];
  }
}
