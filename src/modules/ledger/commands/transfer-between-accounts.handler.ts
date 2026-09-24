import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccountsService } from '../../accounts/accounts.service.js';
import { CurrencyFxService } from '../../currency-fx/currency-fx.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getUserBaseCurrency, writeLedgerEvent } from '../ledger.utils.js';
import { TransferBetweenAccountsCommand } from './transfer-between-accounts.command.js';

@CommandHandler(TransferBetweenAccountsCommand)
export class TransferBetweenAccountsHandler
  implements ICommandHandler<TransferBetweenAccountsCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async execute(command: TransferBetweenAccountsCommand) {
    if (command.fromAccountId === command.toAccountId) {
      throw new BadRequestException('Mənbə və hədəf hesab eyni ola bilməz');
    }

    const amount = new Prisma.Decimal(command.amount);
    if (!amount.isPositive()) {
      throw new BadRequestException('Transfer məbləği müsbət olmalıdır');
    }

    const fromAccount = await this.accountsService.getOwnedActiveAccount(
      command.userId,
      command.fromAccountId,
    );
    const toAccount = await this.accountsService.getOwnedActiveAccount(
      command.userId,
      command.toAccountId,
    );

    const occurredAt = command.occurredAt ? new Date(command.occurredAt) : new Date();
    const baseCurrency = await getUserBaseCurrency(this.prisma, command.userId);
    const rateFromToBase = await this.currencyFxService.getRate(
      fromAccount.currency,
      baseCurrency,
      occurredAt,
    );
    const rateToToBase = await this.currencyFxService.getRate(
      toAccount.currency,
      baseCurrency,
      occurredAt,
    );
    const rateFromToTo = await this.currencyFxService.getRate(
      fromAccount.currency,
      toAccount.currency,
      occurredAt,
    );
    const creditAmount = amount.mul(rateFromToTo);

    const transactionGroupId = randomUUID();
    const { entries } = await writeLedgerEvent(this.prisma, {
      userId: command.userId,
      clientId: command.clientId,
      eventType: 'TransferExecuted',
      aggregateId: transactionGroupId,
      transactionGroupId,
      payload: {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: amount.toString(),
        creditAmount: creditAmount.toString(),
        occurredAt: occurredAt.toISOString(),
        note: command.note ?? null,
      },
      entries: [
        {
          accountId: fromAccount.id,
          amount,
          direction: 'debit',
          currency: fromAccount.currency,
          fxRateToBase: rateFromToBase,
          occurredAt,
          note: command.note,
          externalRef: command.externalRefs?.from,
        },
        {
          accountId: toAccount.id,
          amount: creditAmount,
          direction: 'credit',
          currency: toAccount.currency,
          fxRateToBase: rateToToBase,
          occurredAt,
          note: command.note,
          externalRef: command.externalRefs?.to,
        },
      ],
    });

    return entries;
  }
}
