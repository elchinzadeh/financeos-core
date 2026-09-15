import { Prisma } from '../../../generated/prisma/client.js';

export interface ParsedStatementRow {
  occurredAt: Date;
  rawDescription: string;
  /** Həmişə müsbət (unsigned); istiqamət `direction`-dadır. */
  amount: Prisma.Decimal;
  direction: 'debit' | 'credit';
  commission: Prisma.Decimal;
  /** Bu sətirdən sonrakı bankın öz göstərdiyi balans — balans-zənciri yoxlaması üçün. */
  balanceAfter: Prisma.Decimal;
  /** Bankın öz daxili cib/xəzinə hərəkəti (real gəlir/xərc deyil). */
  isInternalTransfer: boolean;
}

export interface BankProfile {
  id: string;
  parse(buffer: Buffer): ParsedStatementRow[];
}
