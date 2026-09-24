import { Injectable } from '@nestjs/common';
import type { Account, Category } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { createCategoryPathResolver } from '../categories/category-path.js';
import { matchRule, type MatchableRule } from '../categories/category-rule-matcher.js';
import {
  JEV_CONFIDENCE_THRESHOLD,
  JEV_MAX_CHOICE_OPTIONS,
  JevClient,
  type JevChoiceAnswer,
  type JevChoiceQuestion,
} from '../jev/jev.client.js';
import { INTERNAL_TRANSFER_CATEGORY_NAME } from '../statement-import/statement-import.constants.js';
import { ClaudeTransactionExtractor } from './claude-transaction-extractor.js';
import { parseTransactionText } from './transaction-text.parser.js';

/** Jev-ə "heç biri uyğun deyil" cavabı üçün açıq variant — `Choice` həmişə nəsə seçdiyi üçün lazımdır. */
const NONE_LABEL = '__none__';

export type Direction = 'income' | 'expense';

export interface TransactionProposal {
  direction: Direction | null;
  amount: string | null;
  currency: string | null;
  accountId: string | null;
  categoryId: string | null;
  dayOffset: number;
  note: string;
  confidence: { direction: number | null; account: number | null; category: number | null };
  source: 'parser' | 'jev' | 'claude';
  warnings: ('amount_missing' | 'multiple_amounts' | 'no_account_in_currency')[];
}

interface UserContext {
  accounts: Account[];
  categories: Category[];
  rules: (MatchableRule & { id: string })[];
}

/**
 * "Sürətli əlavə": serbəst mətndən gəlir/xərc **təklifi** hazırlayır. Heç nə yazmır — yazma istifadəçi təsdiqindən
 * sonra mövcud recordIncome/recordExpense command-ları ilə olur (bax docs/decisions/0021-jev-ai-suggestions.md).
 *
 * Kaskad: deterministik parser (məbləğ/valyuta/gün/qeyd) → açar söz qaydası → hesab adı/tək hesab → Jev
 * (istiqamət, hesab, kateqoriya seçimləri) → Claude Haiku ehtiyatı (yalnız parser/Jev kifayət etmədikdə; nəticəsi
 * parser/Jev nəticəsinin yerinə keçir, onlarla qarışdırılmır). Hər addım best-effort-dur: provayder əlçatan
 * deyilsə, sahələr boş qalır və istifadəçi təsdiq kartında özü doldurur.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly jev: JevClient,
    private readonly claude: ClaudeTransactionExtractor,
  ) {}

  async parse(userId: string, text: string): Promise<TransactionProposal> {
    const parsed = parseTransactionText(text);
    const proposal: TransactionProposal = {
      direction: null,
      amount: parsed.amount,
      currency: parsed.currency,
      accountId: null,
      categoryId: null,
      dayOffset: parsed.dayOffset,
      note: parsed.note,
      confidence: { direction: null, account: null, category: null },
      source: 'parser',
      warnings: [...parsed.warnings],
    };

    // Məbləğ yoxdursa, Jev-in köməyi olmaz (rəqəm çıxarmır) — yalnız Claude ehtiyatı ("qırx beş manat") kömək edə bilər.
    if (parsed.amount === null) {
      if (!this.claude.isEnabled()) return proposal;
      const fromClaude = await this.fallbackToClaude(text, await this.loadContext(userId));
      return fromClaude ?? proposal;
    }

    const context = await this.loadContext(userId);
    const questions: Record<string, JevChoiceQuestion> = {};
    let accountUncertain = false;
    let jevFailed = false;

    this.applyRule(proposal, context, text);
    const accountQuestion = this.resolveAccountOrAsk(proposal, context, text);
    if (accountQuestion) questions.account = accountQuestion;
    if (proposal.direction === null) {
      questions.direction = this.directionQuestion();
      const categoryQuestion = this.categoryQuestion(context.categories);
      if (categoryQuestion) questions.category = categoryQuestion;
    }

    if (Object.keys(questions).length > 0) {
      const answers = await this.jev.choose(text, questions);
      if (answers) {
        proposal.source = 'jev';
        accountUncertain = this.applyAnswers(proposal, context, questions, answers).accountUncertain;
      } else {
        jevFailed = true;
      }
    }

    const needsFallback =
      proposal.warnings.includes('multiple_amounts') || jevFailed || proposal.direction === null || accountUncertain;
    if (needsFallback && this.claude.isEnabled()) {
      const fromClaude = await this.fallbackToClaude(text, context);
      if (fromClaude) return fromClaude;
    }

    return proposal;
  }

  /** Mətni Claude-a verir; nəticə uğurludursa, tam təklifi (parser/Jev-i əvəz edərək) qaytarır. */
  private async fallbackToClaude(text: string, context: UserContext): Promise<TransactionProposal | null> {
    const extraction = await this.claude.extract({
      text,
      accounts: context.accounts,
      categories: context.categories,
    });
    if (!extraction) return null;

    const proposal: TransactionProposal = {
      direction: extraction.direction,
      amount: extraction.amount,
      currency: extraction.currency,
      accountId: extraction.accountId,
      categoryId: extraction.categoryId,
      dayOffset: extraction.dayOffset,
      note: extraction.note,
      // Claude etibar balı qaytarmır — null "ölçülməyib" deməkdir.
      confidence: { direction: null, account: null, category: null },
      source: 'claude',
      warnings: [],
    };
    if (proposal.amount === null) proposal.warnings.push('amount_missing');
    if (proposal.currency && context.accounts.length > 0 && !context.accounts.some((a) => a.currency === proposal.currency)) {
      proposal.warnings.push('no_account_in_currency');
    }
    this.reconcileCategoryWithDirection(proposal, context);
    return proposal;
  }

  private async loadContext(userId: string): Promise<UserContext> {
    const [accounts, categories, rules] = await Promise.all([
      this.accountsService.list(userId, false),
      this.prisma.category.findMany({ where: { userId } }),
      this.prisma.categorySuggestionRule.findMany({ where: { userId }, include: { category: true } }),
    ]);
    return { accounts, categories, rules };
  }

  /** Açar söz qaydası dəqiqdir və pulsuzdur: yalnız bir növdə uyğunluq varsa istiqaməti və kateqoriyanı qaydadan götürür. */
  private applyRule(proposal: TransactionProposal, context: UserContext, text: string): void {
    const expense = matchRule(context.rules, text, 'expense');
    const income = matchRule(context.rules, text, 'income');
    const hit = expense && !income ? expense : income && !expense ? income : null;
    if (!hit) return;

    proposal.direction = hit.category.kind;
    proposal.categoryId = hit.categoryId;
    proposal.confidence.direction = 1;
    proposal.confidence.category = 1;
  }

  /**
   * Hesabı deterministik həll etməyə çalışır (mətndə hesab adı, tək namizəd). Həll olunmursa Jev sualı qaytarır.
   * Valyuta mətndə göstərilibsə, əvvəl həmin valyutadakı hesablar namizəd olur.
   */
  private resolveAccountOrAsk(
    proposal: TransactionProposal,
    context: UserContext,
    text: string,
  ): JevChoiceQuestion | null {
    let candidates = context.accounts;
    if (proposal.currency) {
      const sameCurrency = candidates.filter((a) => a.currency === proposal.currency);
      if (sameCurrency.length > 0) {
        candidates = sameCurrency;
      } else if (candidates.length > 0) {
        proposal.warnings.push('no_account_in_currency');
      }
    }
    if (candidates.length === 0) return null;

    const named = this.matchAccountByName(candidates, text);
    if (named) {
      proposal.accountId = named.id;
      proposal.confidence.account = 1;
      return null;
    }
    if (candidates.length === 1) {
      proposal.accountId = candidates[0].id;
      proposal.confidence.account = 1;
      return null;
    }
    if (candidates.length + 1 > JEV_MAX_CHOICE_OPTIONS) return null;

    const options: Record<string, string | null> = {};
    for (const account of candidates) {
      options[account.id] = `${account.name} (${account.type}, ${account.currency})`;
    }
    options[NONE_LABEL] = 'Mətndə hesab barədə heç nə yoxdur';
    return {
      instructions:
        'Bu əməliyyat hansı hesabla aparılıb? "nağd", "kartla" kimi ipucuları hesab tipinə uyğun gəlirsə həmin hesabı seçin.',
      options,
    };
  }

  /** Mətndə hesabın adı keçirsə (böyük-kiçik hərfə həssas deyil), ən uzun ad seçilir; bərabərlikdə seçim edilmir. */
  private matchAccountByName(accounts: Account[], text: string): Account | null {
    const haystack = text.toLocaleLowerCase('az');
    const hits = accounts
      .filter((a) => a.name.trim().length >= 3 && haystack.includes(a.name.trim().toLocaleLowerCase('az')))
      .sort((a, b) => b.name.length - a.name.length);
    if (hits.length === 0) return null;
    if (hits.length > 1 && hits[0].name.length === hits[1].name.length) return null;
    return hits[0];
  }

  private directionQuestion(): JevChoiceQuestion {
    return {
      instructions: 'Bu mesajda istifadəçi pul xərcləyib, yoxsa pul qazanıb və ya alıb?',
      options: {
        expense: 'Pul xərclənib (alış, ödəniş, xərc)',
        income: 'Pul daxil olub (maaş, gəlir, qazanc)',
      },
    };
  }

  /** İstiqamət bəlli olmadığı üçün hər iki növün kateqoriyaları verilir; növ etiketi variant izahındadır. */
  private categoryQuestion(categories: Category[]): JevChoiceQuestion | null {
    const pathOf = createCategoryPathResolver(categories);
    const options: Record<string, string | null> = {};
    for (const category of categories.filter((c) => c.name !== INTERNAL_TRANSFER_CATEGORY_NAME)) {
      options[category.id] = `${category.kind === 'expense' ? 'Xərc' : 'Gəlir'}: ${pathOf(category)}`;
    }
    const count = Object.keys(options).length;
    if (count === 0 || count + 1 > JEV_MAX_CHOICE_OPTIONS) return null;

    options[NONE_LABEL] = 'Heç bir kateqoriya uyğun deyil';
    return { instructions: 'Bu əməliyyat hansı kateqoriyaya aiddir?', options };
  }

  /** Cavabları təklifə tətbiq edir. `accountUncertain`: Jev hesab seçib, amma etibar həddindən aşağıdır. */
  private applyAnswers(
    proposal: TransactionProposal,
    context: UserContext,
    questions: Record<string, JevChoiceQuestion>,
    answers: Record<string, JevChoiceAnswer>,
  ): { accountUncertain: boolean } {
    const pick = (name: string): { choice: string; confidence: number } | null => {
      const answer = answers[name];
      const question = questions[name];
      if (!answer || !question) return null;
      if (answer.choice === NONE_LABEL || !Object.hasOwn(question.options, answer.choice)) {
        return { choice: NONE_LABEL, confidence: answer.confidence };
      }
      return answer;
    };
    const confident = (answer: { choice: string; confidence: number } | null) =>
      answer !== null && answer.choice !== NONE_LABEL && answer.confidence >= JEV_CONFIDENCE_THRESHOLD;

    const direction = pick('direction');
    if (direction) {
      proposal.confidence.direction = direction.confidence;
      if (confident(direction)) proposal.direction = direction.choice as Direction;
    }

    const account = pick('account');
    if (account) {
      proposal.confidence.account = account.confidence;
      if (confident(account)) proposal.accountId = account.choice;
    }
    // "Hesab mətndə yoxdur" (__none__) normal haldır, Claude da bunu dəyişməz — yalnız real seçim qeyri-müəyyən olanda.
    const accountUncertain = account !== null && account.choice !== NONE_LABEL && !confident(account);

    const category = pick('category');
    if (category) {
      proposal.confidence.category = category.confidence;
      if (confident(category)) proposal.categoryId = category.choice;
    }

    this.reconcileCategoryWithDirection(proposal, context);
    return { accountUncertain };
  }

  /** Kateqoriya növü istiqamətlə uyğun gəlmirsə kateqoriya atılır; istiqamət bəlli deyilsə kateqoriyadan çıxarılır. */
  private reconcileCategoryWithDirection(proposal: TransactionProposal, context: UserContext): void {
    if (!proposal.categoryId) return;
    const category = context.categories.find((c) => c.id === proposal.categoryId);
    if (!category) {
      proposal.categoryId = null;
      return;
    }
    if (proposal.direction && category.kind !== proposal.direction) {
      proposal.categoryId = null;
    } else if (!proposal.direction) {
      proposal.direction = category.kind;
      proposal.confidence.direction = proposal.confidence.category;
    }
  }
}
