import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccountsService } from '../../accounts/accounts.service.js';
import { CategoriesService } from '../../categories/categories.service.js';
import { CurrencyFxService } from '../../currency-fx/currency-fx.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getUserBaseCurrency, writeLedgerEvent } from '../ledger.utils.js';
import { RecordIncomeCommand } from './record-income.command.js';

@CommandHandler(RecordIncomeCommand)
export class RecordIncomeHandler implements ICommandHandler<RecordIncomeCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async execute(command: RecordIncomeCommand) {
    const amount = new Prisma.Decimal(command.amount);
    if (!amount.isPositive()) {
      throw new BadRequestException('Gəlir məbləği müsbət olmalıdır');
    }

    const account = await this.accountsService.getOwnedActiveAccount(
      command.userId,
      command.accountId,
    );
    if (command.categoryId) {
      await this.categoriesService.getAccessibleCategory(
        command.userId,
        command.categoryId,
        'income',
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
      eventType: 'IncomeRecorded',
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
          direction: 'credit',
          currency: account.currency,
          fxRateToBase,
          occurredAt,
          note: command.note,
        },
      ],
    });

    return entries[0];
  }
}
