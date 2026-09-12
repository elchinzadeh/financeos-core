import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { UpsertFxRateDto } from './dto/upsert-fx-rate.dto.js';

@Injectable()
export class CurrencyFxService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertRate(dto: UpsertFxRateDto) {
    const rateDate = toDateOnly(dto.rateDate ? new Date(dto.rateDate) : new Date());
    return this.prisma.fxRate.upsert({
      where: {
        baseCurrency_quoteCurrency_rateDate: {
          baseCurrency: dto.baseCurrency,
          quoteCurrency: dto.quoteCurrency,
          rateDate,
        },
      },
      create: {
        baseCurrency: dto.baseCurrency,
        quoteCurrency: dto.quoteCurrency,
        rateDate,
        rate: dto.rate,
        source: dto.source,
      },
      update: { rate: dto.rate, source: dto.source },
    });
  }

  async find(baseCurrency?: string, quoteCurrency?: string) {
    return this.prisma.fxRate.findMany({
      where: { baseCurrency, quoteCurrency },
      orderBy: { rateDate: 'desc' },
      take: 30,
    });
  }

  /**
   * `base` valyutasının 1 vahidi `quote`-da neçəyə bərabərdir, `asOf`-a qədərki ən son kursla.
   * Düz istiqamət tapılmasa, əks istiqamətin tərsi yoxlanılır. Heç biri yoxdursa, atır.
   */
  async getRate(base: string, quote: string, asOf: Date): Promise<Prisma.Decimal> {
    if (base === quote) return new Prisma.Decimal(1);
    const asOfDate = toDateOnly(asOf);

    const direct = await this.prisma.fxRate.findFirst({
      where: { baseCurrency: base, quoteCurrency: quote, rateDate: { lte: asOfDate } },
      orderBy: { rateDate: 'desc' },
    });
    if (direct) return direct.rate;

    const inverse = await this.prisma.fxRate.findFirst({
      where: { baseCurrency: quote, quoteCurrency: base, rateDate: { lte: asOfDate } },
      orderBy: { rateDate: 'desc' },
    });
    if (inverse) return new Prisma.Decimal(1).dividedBy(inverse.rate);

    throw new NotFoundException(
      `FX kursu tapılmadı: ${base}->${quote} (${asOfDate.toISOString().slice(0, 10)} tarixinə qədər)`,
    );
  }
}

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
