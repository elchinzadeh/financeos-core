import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccountsService } from '../../accounts/accounts.service.js';
import { CurrencyFxService } from '../../currency-fx/currency-fx.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { getUserBaseCurrency, writeLedgerEvent } from '../ledger.utils.js';
import { AdjustBalanceCommand } from './adjust-balance.command.js';

@CommandHandler(AdjustBalanceCommand)
export class AdjustBalanceHandler implements ICommandHandler<AdjustBalanceCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async execute(command: AdjustBalanceCommand) {
    const delta = new Prisma.Decimal(command.delta);
    if (delta.isZero()) {
      throw new BadRequestException('Düzəliş məbləği sıfır ola bilməz');
    }

    const account = await this.accountsService.getOwnedActiveAccount(
      command.userId,
      command.accountId,
    );

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
      eventType: 'BalanceAdjusted',
      aggregateId: account.id,
      transactionGroupId,
      payload: {
        accountId: account.id,
        delta: delta.toString(),
        occurredAt: occurredAt.toISOString(),
        note: command.note ?? null,
      },
      entries: [
        {
          accountId: account.id,
          amount: delta.abs(),
          direction: delta.isPositive() ? 'credit' : 'debit',
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
