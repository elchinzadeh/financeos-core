import { parse } from 'csv-parse/sync';
import { Prisma } from '../../../generated/prisma/client.js';
import type { BankProfile, ParsedStatementRow } from './bank-profile.interface.js';

/**
 * Leobank daxili "Xəzinə/Savings" cibinin bank tərəfindən yaradılan təsvir naxışları.
 * Bunlar formata spesifik bilikdir (generic kateqoriya-qaydası cədvəlinə yox, birbaşa
 * profilin özünə aiddir) — bax docs/decisions/0016-bank-statement-import.md.
 */
const INTERNAL_TRANSFER_PATTERNS = [/Xəzinə/i, /Artım\s*«/i, /Balans tamamlanması\s*«/i];

function parseLeobankDate(raw: string): Date {
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    throw new Error(`Leobank tarix formatı tanınmadı: "${raw}"`);
  }
  const [, day, month, year, hour, minute, second] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
  );
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const LeobankProfile: BankProfile = {
  id: 'leobank',

  parse(buffer: Buffer): ParsedStatementRow[] {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Record<string, string>[];

    return records.map((row) => {
      const rawDescription = cleanDescription(row['Təyinat'] ?? '');
      const signedAmount = new Prisma.Decimal(row['Məbləğ']);
      const direction: 'debit' | 'credit' = signedAmount.isNegative() ? 'debit' : 'credit';

      return {
        occurredAt: parseLeobankDate(row['Tarix']),
        rawDescription,
        amount: signedAmount.abs(),
        direction,
        commission: new Prisma.Decimal(row['Komissiya'] || '0'),
        balanceAfter: new Prisma.Decimal(row['Balans']),
        isInternalTransfer: INTERNAL_TRANSFER_PATTERNS.some((pattern) => pattern.test(rawDescription)),
      };
    });
  },
};
