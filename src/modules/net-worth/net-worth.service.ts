import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { CurrencyFxService } from '../currency-fx/currency-fx.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CategoryKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CategorySummaryItemDto } from './dto/category-summary-item.dto.js';
import { NetWorthResponseDto } from './dto/net-worth-response.dto.js';
import { TimelinePointDto } from './dto/timeline-point.dto.js';

const MAX_TIMELINE_POINTS = 366;

@Injectable()
export class NetWorthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async getSnapshot(userId: string, asOf?: Date): Promise<NetWorthResponseDto> {
    const asOfDate = asOf ?? new Date();
    const baseCurrency = await this.getUserBaseCurrency(userId);
    const accounts = await this.accountsService.list(userId, true);

    let total = new Prisma.Decimal(0);
    const accountRows = [];
    for (const account of accounts) {
      const balance = asOf
        ? await this.balanceAsOf(account.id, asOfDate)
        : await this.currentBalance(account.id);
      const rate = await this.currencyFxService.getRate(account.currency, baseCurrency, asOfDate);
      const convertedBalance = balance.mul(rate);
      total = total.add(convertedBalance);

      accountRows.push({
        accountId: account.id,
        name: account.name,
        currency: account.currency,
        balance: balance.toString(),
        convertedBalance: convertedBalance.toString(),
      });
    }

    return {
      asOf: asOfDate.toISOString(),
      baseCurrency,
      total: total.toString(),
      accounts: accountRows,
    };
  }

  async getTimeline(
    userId: string,
    from: Date,
    to: Date,
    interval: 'day' | 'week' | 'month',
  ): Promise<TimelinePointDto[]> {
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" "to"-dan sonra ola bilməz');
    }

    const periodStarts: Date[] = [];
    let cursor = new Date(from);
    while (cursor.getTime() <= to.getTime()) {
      periodStarts.push(new Date(cursor));
      if (periodStarts.length > MAX_TIMELINE_POINTS) {
        throw new BadRequestException(
          `Timeline aralığı həddindən genişdir (maksimum ${MAX_TIMELINE_POINTS} nöqtə)`,
        );
      }
      cursor = advance(cursor, interval);
    }

    // Hər nöqtə öz dövrünün SONUNDAKI balansı təmsil edir (məs. günün sonu), "to"-dan sonraya keçmir.
    const result: TimelinePointDto[] = [];
    for (const periodStart of periodStarts) {
      const periodEnd = new Date(advance(periodStart, interval).getTime() - 1);
      const asOfPoint = periodEnd.getTime() < to.getTime() ? periodEnd : to;
      const snapshot = await this.getSnapshot(userId, asOfPoint);
      result.push({ date: snapshot.asOf, netWorth: snapshot.total });
    }
    return result;
  }

  async getCategorySummary(
    userId: string,
    from: Date,
    to: Date,
    kind?: CategoryKind,
  ): Promise<CategorySummaryItemDto[]> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        account: { userId },
        occurredAt: { gte: from, lte: to },
        archivedAt: null,
        ...(kind ? { category: { kind } } : {}),
      },
      include: { category: true },
    });

    const buckets = new Map<string, CategorySummaryItemDto & { totalDecimal: Prisma.Decimal }>();
    for (const entry of entries) {
      const key = entry.categoryId ?? 'uncategorized';
      const signed = entry.direction === 'credit' ? entry.amount : entry.amount.negated();
      const contribution = signed.mul(entry.fxRateToBase);

      const existing = buckets.get(key);
      if (existing) {
        existing.totalDecimal = existing.totalDecimal.add(contribution);
      } else {
        buckets.set(key, {
          categoryId: entry.categoryId,
          categoryName: entry.category?.name ?? null,
          kind: entry.category?.kind ?? null,
          total: '0',
          totalDecimal: contribution,
        });
      }
    }

    return Array.from(buckets.values()).map(({ totalDecimal, ...rest }) => ({
      ...rest,
      total: totalDecimal.toString(),
    }));
  }

  private async currentBalance(accountId: string): Promise<Prisma.Decimal> {
    const balance = await this.prisma.accountBalance.findUnique({ where: { accountId } });
    return balance?.balance ?? new Prisma.Decimal(0);
  }

  private async balanceAsOf(accountId: string, asOf: Date): Promise<Prisma.Decimal> {
    const [creditSum, debitSum] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { accountId, direction: 'credit', occurredAt: { lte: asOf }, archivedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { accountId, direction: 'debit', occurredAt: { lte: asOf }, archivedAt: null },
        _sum: { amount: true },
      }),
    ]);
    const credit = creditSum._sum.amount ?? new Prisma.Decimal(0);
    const debit = debitSum._sum.amount ?? new Prisma.Decimal(0);
    return credit.sub(debit);
  }

  private async getUserBaseCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return user.baseCurrency;
  }
}

function advance(date: Date, interval: 'day' | 'week' | 'month'): Date {
  const next = new Date(date);
  if (interval === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
