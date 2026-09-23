import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { BANK_PROFILES } from './bank-profiles/bank-profile.registry.js';
import type { CommitRowDto } from './dto/commit-row.dto.js';

const BALANCE_TOLERANCE = new Prisma.Decimal('0.01');
const INTERNAL_TRANSFER_CATEGORY_NAME = 'Daxili köçürmə';

@Injectable()
export class StatementImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
  ) {}

  async preview(userId: string, accountId: string, bankProfileId: string, fileBuffer: Buffer) {
    const profile = BANK_PROFILES[bankProfileId];
    if (!profile) {
      throw new BadRequestException(`Naməlum bank profili: ${bankProfileId}`);
    }
    await this.accountsService.getOwnedActiveAccount(userId, accountId);

    const parsedRows = profile.parse(fileBuffer);
    const fingerprints = parsedRows.map((row) =>
      this.fingerprint(accountId, row.occurredAt, row.direction, row.amount, row.rawDescription),
    );

    const existing = await this.prisma.ledgerEntry.findMany({
      where: { accountId, externalRef: { in: fingerprints } },
      select: { externalRef: true },
    });
    const existingRefs = new Set(existing.map((e) => e.externalRef));

    const rules = await this.prisma.categorySuggestionRule.findMany({
      where: { userId },
      include: { category: true },
    });
    const internalCategories = await this.prisma.category.findMany({
      where: { userId, name: INTERNAL_TRANSFER_CATEGORY_NAME },
    });
    const internalExpenseCategoryId = internalCategories.find((c) => c.kind === 'expense')?.id ?? null;
    const internalIncomeCategoryId = internalCategories.find((c) => c.kind === 'income')?.id ?? null;

    let previousBalance: Prisma.Decimal | null = null;
    let duplicateCount = 0;
    let balanceMismatchCount = 0;

    const rows = parsedRows.map((row, index) => {
      const fingerprint = fingerprints[index];
      const isDuplicate = existingRefs.has(fingerprint);
      if (isDuplicate) duplicateCount++;

      let balanceMismatch = false;
      if (previousBalance !== null) {
        const delta = row.direction === 'credit' ? row.amount : row.amount.negated();
        const expected = previousBalance.plus(delta).minus(row.commission);
        balanceMismatch = expected.minus(row.balanceAfter).abs().greaterThan(BALANCE_TOLERANCE);
      }
      if (balanceMismatch) balanceMismatchCount++;
      previousBalance = row.balanceAfter;

      let suggestedCategoryId: string | null = null;
      if (row.isInternalTransfer) {
        suggestedCategoryId = (row.direction === 'debit' ? internalExpenseCategoryId : internalIncomeCategoryId);
      } else {
        const expectedKind = row.direction === 'debit' ? 'expense' : 'income';
        const description = row.rawDescription.toLowerCase();
        const match = rules
          .filter((r) => r.category.kind === expectedKind)
          .filter((r) => description.includes(r.keyword.toLowerCase()))
          .sort((a, b) => b.keyword.length - a.keyword.length)[0];
        suggestedCategoryId = match?.categoryId ?? null;
      }

      return {
        rowIndex: index,
        occurredAt: row.occurredAt.toISOString(),
        description: row.rawDescription,
        amount: row.amount.toString(),
        direction: row.direction,
        suggestedCategoryId,
        isInternalTransfer: row.isInternalTransfer,
        isDuplicate,
        balanceMismatch,
        fingerprint,
      };
    });

    return { rows, totalRows: rows.length, duplicateCount, balanceMismatchCount };
  }

  async commit(userId: string, clientId: string, accountId: string, rows: CommitRowDto[]) {
    await this.accountsService.getOwnedActiveAccount(userId, accountId);

    let imported = 0;
    let skippedDuplicates = 0;
    let excluded = 0;

    for (const row of rows) {
      if (!row.include) {
        excluded++;
        continue;
      }

      const alreadyExists = await this.prisma.ledgerEntry.findFirst({
        where: { accountId, externalRef: row.fingerprint },
      });

      if (row.direction === 'credit') {
        await this.ledgerService.recordIncome(userId, clientId, {
          accountId,
          amount: row.amount,
          categoryId: row.categoryId,
          occurredAt: row.occurredAt,
          note: row.note,
          externalRef: row.fingerprint,
        });
      } else {
        await this.ledgerService.recordExpense(userId, clientId, {
          accountId,
          amount: row.amount,
          categoryId: row.categoryId,
          occurredAt: row.occurredAt,
          note: row.note,
          externalRef: row.fingerprint,
        });
      }

      if (row.categoryId && row.saveRuleKeyword) {
        await this.saveLearnedRule(userId, row.saveRuleKeyword, row.categoryId);
      }

      if (alreadyExists) {
        skippedDuplicates++;
      } else {
        imported++;
      }
    }

    return { imported, skippedDuplicates, excluded };
  }

  private async saveLearnedRule(userId: string, rawKeyword: string, categoryId: string): Promise<void> {
    const keyword = rawKeyword.trim();
    if (!keyword) return;

    const existing = await this.prisma.categorySuggestionRule.findFirst({
      where: { userId, keyword: { equals: keyword, mode: 'insensitive' } },
    });
    if (existing) return;

    await this.prisma.categorySuggestionRule.create({
      data: { userId, keyword, categoryId },
    });
  }

  private fingerprint(
    accountId: string,
    occurredAt: Date,
    direction: 'debit' | 'credit',
    amount: Prisma.Decimal,
    description: string,
  ): string {
    const raw = `${accountId}|${occurredAt.toISOString()}|${direction}|${amount.toString()}|${description}`;
    return createHash('sha256').update(raw).digest('hex');
  }
}
