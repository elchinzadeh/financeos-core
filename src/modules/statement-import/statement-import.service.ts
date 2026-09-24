import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { matchRule } from '../categories/category-rule-matcher.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { BANK_PROFILES } from './bank-profiles/bank-profile.registry.js';
import { AiGroup, aiGroupKey, CategoryAiSuggester } from './category-ai-suggester.js';
import type { CommitRowDto } from './dto/commit-row.dto.js';
import { INTERNAL_TRANSFER_CATEGORY_NAME, type SuggestionSource } from './statement-import.constants.js';

const BALANCE_TOLERANCE = new Prisma.Decimal('0.01');

@Injectable()
export class StatementImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly categoryAiSuggester: CategoryAiSuggester,
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
      let suggestionSource: SuggestionSource | null = null;
      if (row.isInternalTransfer) {
        suggestedCategoryId = (row.direction === 'debit' ? internalExpenseCategoryId : internalIncomeCategoryId);
        if (suggestedCategoryId) suggestionSource = 'internal_transfer';
      } else {
        const expectedKind = row.direction === 'debit' ? 'expense' : 'income';
        suggestedCategoryId = matchRule(rules, row.rawDescription, expectedKind)?.categoryId ?? null;
        if (suggestedCategoryId) suggestionSource = 'rule';
      }

      return {
        rowIndex: index,
        occurredAt: row.occurredAt.toISOString(),
        description: row.rawDescription,
        amount: row.amount.toString(),
        direction: row.direction,
        suggestedCategoryId,
        suggestionSource,
        suggestionConfidence: null as number | null,
        isInternalTransfer: row.isInternalTransfer,
        isDuplicate,
        balanceMismatch,
        fingerprint,
      };
    });

    await this.applyAiSuggestions(userId, rows);

    return { rows, totalRows: rows.length, duplicateCount, balanceMismatchCount };
  }

  /**
   * Qayda tapılmayan (və daxili köçürmə/dublikat olmayan) sətirləri `(istiqamət, təsvir)` üzrə qruplaşdırıb hər qrup
   * üçün AI təklifi alır (ADR-0021). AI heç vaxt mövcud qayda/daxili köçürmə təklifini üstələmir və heç nə yazmır.
   */
  private async applyAiSuggestions(
    userId: string,
    rows: {
      description: string;
      amount: string;
      direction: 'debit' | 'credit';
      suggestedCategoryId: string | null;
      suggestionSource: SuggestionSource | null;
      suggestionConfidence: number | null;
      isInternalTransfer: boolean;
      isDuplicate: boolean;
    }[],
  ): Promise<void> {
    const groups = new Map<string, AiGroup>();
    for (const row of rows) {
      if (row.suggestedCategoryId || row.isInternalTransfer || row.isDuplicate) continue;
      const key = aiGroupKey(row.direction, row.description);
      const group = groups.get(key);
      if (group) group.rows++;
      else groups.set(key, { key, description: row.description, amount: row.amount, direction: row.direction, rows: 1 });
    }

    const suggestions = await this.categoryAiSuggester.suggest(userId, [...groups.values()]);
    if (suggestions.size === 0) return;

    for (const row of rows) {
      if (row.suggestedCategoryId) continue;
      const suggestion = suggestions.get(aiGroupKey(row.direction, row.description));
      if (!suggestion) continue;
      row.suggestedCategoryId = suggestion.categoryId;
      row.suggestionSource = 'ai';
      row.suggestionConfidence = suggestion.confidence;
    }
  }

  async commit(userId: string, clientId: string, accountId: string, rows: CommitRowDto[]) {
    const account = await this.accountsService.getOwnedActiveAccount(userId, accountId);
    await this.assertTransferRowsValid(userId, account, rows);

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

      if (row.transferAccountId) {
        // Köçürmə: gəlir/xərc yox, iki hesab arasında transfer (ADR-0022). Dublikat aşkarlanması üçün fingerprint
        // idxal hesabının sətrinə yazılır.
        if (alreadyExists) {
          skippedDuplicates++;
          continue;
        }
        const isDebit = row.direction === 'debit';
        await this.ledgerService.transfer(
          userId,
          clientId,
          {
            fromAccountId: isDebit ? accountId : row.transferAccountId,
            toAccountId: isDebit ? row.transferAccountId : accountId,
            amount: row.amount,
            occurredAt: row.occurredAt,
            note: row.note,
          },
          isDebit ? { from: row.fingerprint } : { to: row.fingerprint },
        );
        imported++;
        continue;
      }

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

  /**
   * Köçürmə kimi işarələnən sətirlərin hesabını əvvəlcədən yoxlayır ki, idxal yarımçıq qalmasın: hesab istifadəçiyə
   * məxsus və aktiv olmalı, idxal hesabından fərqli və eyni valyutalı olmalıdır (transfer məbləği mənbə hesabın
   * valyutasındadır, hədəfə kurs ilə çevrilir — bank çıxarışındakı məbləğlə üst-üstə düşməsi üçün eyni valyuta tələb olunur).
   */
  private async assertTransferRowsValid(
    userId: string,
    account: { id: string; currency: string },
    rows: CommitRowDto[],
  ): Promise<void> {
    const included = rows.filter((row) => row.include);
    if (included.some((row) => row.transferAccountId && row.categoryId)) {
      throw new BadRequestException('Köçürmə sətrində kateqoriya seçilə bilməz');
    }

    const targetIds = new Set(included.flatMap((row) => (row.transferAccountId ? [row.transferAccountId] : [])));
    for (const targetId of targetIds) {
      const target = await this.accountsService.getOwnedActiveAccount(userId, targetId);
      if (target.id === account.id) {
        throw new BadRequestException('Köçürmə hesabı idxal olunan hesabla eyni ola bilməz');
      }
      if (target.currency !== account.currency) {
        throw new BadRequestException(
          `Köçürmə yalnız eyni valyutalı hesablar arasında dəstəklənir (${account.currency} ≠ ${target.currency})`,
        );
      }
    }
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
