import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrencyFxService } from './currency-fx.service.js';
import { FrankfurterClient } from './frankfurter-client.js';

const DEFAULT_CURRENCIES = ['AZN', 'USD', 'EUR'];

@Injectable()
export class FxSyncService implements OnModuleInit {
  private readonly logger = new Logger(FxSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyFxService: CurrencyFxService,
    private readonly frankfurterClient: FrankfurterClient,
  ) {}

  onModuleInit(): void {
    // Gözlənilmir: xarici API-nin yavaşlığı tətbiqin qalxmasını bloklamamalıdır.
    void this.syncDailyRates();
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async handleCron(): Promise<void> {
    await this.syncDailyRates();
  }

  async syncDailyRates(): Promise<void> {
    const currencies = await this.getCurrenciesInUse();

    for (const base of currencies) {
      const quotes = currencies.filter((c) => c !== base);
      if (quotes.length === 0) continue;

      try {
        const rates = await this.frankfurterClient.getRates(base, quotes);
        for (const { quote, rate, date } of rates) {
          await this.currencyFxService.upsertRate({
            baseCurrency: base,
            quoteCurrency: quote,
            rate: String(rate),
            rateDate: date,
            source: 'frankfurter',
          });
        }
      } catch (err) {
        this.logger.error(`FX sinxronizasiyası uğursuz oldu (base=${base}): ${(err as Error).message}`);
      }
    }
  }

  private async getCurrenciesInUse(): Promise<string[]> {
    const [accounts, users, goals] = await Promise.all([
      this.prisma.account.findMany({ select: { currency: true }, distinct: ['currency'] }),
      this.prisma.user.findMany({ select: { baseCurrency: true }, distinct: ['baseCurrency'] }),
      this.prisma.goal.findMany({ select: { targetCurrency: true }, distinct: ['targetCurrency'] }),
    ]);

    const currencies = new Set<string>([
      ...accounts.map((a) => a.currency),
      ...users.map((u) => u.baseCurrency),
      ...goals.map((g) => g.targetCurrency),
    ]);

    return currencies.size > 0 ? Array.from(currencies) : DEFAULT_CURRENCIES;
  }
}
