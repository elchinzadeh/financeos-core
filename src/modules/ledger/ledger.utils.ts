import { Prisma } from '../../generated/prisma/client.js';
import type { EntryDirection } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface LedgerWriteEntry {
  accountId: string;
  categoryId?: string | null;
  amount: Prisma.Decimal;
  direction: EntryDirection;
  currency: string;
  fxRateToBase: Prisma.Decimal;
  occurredAt: Date;
  note?: string | null;
}

export interface WriteLedgerEventParams {
  userId: string;
  clientId: string;
  eventType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  transactionGroupId: string;
  entries: LedgerWriteEntry[];
}

/**
 * Bir Ledger command-ının nəticəsini bir DB transaksiyası daxilində yazır:
 * `events` sətri + hər entry üçün `ledger_entries` sətri + `account_balances` artım/azalması.
 */
export async function writeLedgerEvent(prisma: PrismaService, params: WriteLedgerEventParams) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        userId: params.userId,
        clientId: params.clientId,
        aggregateType: 'ledger',
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        payload: params.payload,
      },
    });

    const entries = [];
    for (const entry of params.entries) {
      const created = await tx.ledgerEntry.create({
        data: {
          eventId: event.id,
          transactionGroupId: params.transactionGroupId,
          accountId: entry.accountId,
          categoryId: entry.categoryId ?? undefined,
          amount: entry.amount,
          direction: entry.direction,
          currency: entry.currency,
          fxRateToBase: entry.fxRateToBase,
          occurredAt: entry.occurredAt,
          note: entry.note ?? undefined,
        },
      });
      entries.push(created);

      const delta = entry.direction === 'credit' ? entry.amount : entry.amount.negated();
      await tx.accountBalance.upsert({
        where: { accountId: entry.accountId },
        create: { accountId: entry.accountId, balance: delta, updatedAt: new Date() },
        update: { balance: { increment: delta }, updatedAt: new Date() },
      });
    }

    return { event, entries };
  });
}

export async function getUserBaseCurrency(prisma: PrismaService, userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.baseCurrency;
}
