import { Injectable } from '@nestjs/common';
import type { Category } from '../../generated/prisma/client.js';
import type { CategoryKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createCategoryPathResolver } from '../categories/category-path.js';
import { JEV_CONFIDENCE_THRESHOLD, JEV_MAX_CHOICE_OPTIONS, JevClient } from '../jev/jev.client.js';
import { INTERNAL_TRANSFER_CATEGORY_NAME } from './statement-import.constants.js';

/** Jev-ə "heç bir kateqoriya uyğun deyil" cavabı üçün açıq variant — `Choice` həmişə nəsə seçdiyi üçün lazımdır. */
export const NO_CATEGORY_LABEL = '__none__';

/**
 * Bir preview-də AI-a göndərilən maksimum qrup sayı. Ən çox təkrarlanan qruplar əvvəl göndərilir, ona görə limit
 * az sayda sətri əhatə etməyən "quyruq" qrupları kəsir.
 */
const MAX_GROUPS_PER_PREVIEW = 150;
/**
 * Bir Jev sorğusunda neçə qrup (hər biri ayrı `Choice` sualı) soruşulur. Real Leobank faylı ilə pilotda Jev/Gateway
 * tək-tək çağırışlarda tez-tez 429/503 qaytardı (~1 çağırış/san. tempində belə); sorğu sayını azaltmaq üçün bir sorğuda
 * bir neçə sual verilir. Provayder bu zaman təsadüfi (~50%) 429/503 verirdi və ölçüdən asılı görünmədi, ona görə
 * batch kiçik (uğursuz sorğunun itkisi azdır), retry isə çoxdur (ADR-0021).
 */
const BATCH_SIZE = 6;
const CONCURRENCY = 3;
/** Uğursuz (429/503/timeout) sorğu üçün əlavə cəhdlər və aralarındakı gözləmə. */
const RETRIES_PER_BATCH = 3;
const RETRY_DELAY_MS = 400;
/** AI addımının ümumi vaxt büdcəsi: Jev yavaşlayanda preview asılı qalmasın (qalan qruplar təklifsiz qalır). */
const AI_TIME_BUDGET_MS = 25_000;
/** Ardıcıl bu qədər tam uğursuz batch-dan sonra qalanı üçün cəhd dayandırılır (rate limit / outage). */
const MAX_CONSECUTIVE_BATCH_FAILURES = 3;

/** Maskalı kart nömrəsi ("552209****8061"): kartdan-karta köçürmədir, kateqoriyası bilinməz — Jev-ə göndərilmir. */
const MASKED_CARD = new RegExp('\\d{4,6}\\*{2,}\\d{4}');

export interface AiGroup {
  key: string;
  description: string;
  amount: string;
  direction: 'debit' | 'credit';
  /** Qrupdakı sətir sayı: çox sətirli qruplar əvvəl təklif alır. */
  rows: number;
}

export interface AiSuggestion {
  categoryId: string;
  confidence: number;
}

export function aiGroupKey(direction: 'debit' | 'credit', description: string): string {
  return `${direction}\u0000${description}`;
}

/**
 * Açar söz qaydası tapılmayan idxal sətirləri üçün Jev ilə kateqoriya təklifi (ADR-0021). Yalnız istifadəçinin
 * öz kateqoriyalarından seçir, yeni kateqoriya yaratmır. Heç nə yazmır. Jev əlçatan deyilsə boş nəticə qaytarır.
 */
@Injectable()
export class CategoryAiSuggester {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jev: JevClient,
  ) {}

  async suggest(userId: string, groups: AiGroup[]): Promise<Map<string, AiSuggestion>> {
    const result = new Map<string, AiSuggestion>();
    if (groups.length === 0 || !this.jev.isEnabled()) return result;

    const categories = await this.prisma.category.findMany({ where: { userId } });
    const optionsByKind: Record<CategoryKind, Record<string, string | null>> = {
      expense: this.buildOptions(categories, 'expense'),
      income: this.buildOptions(categories, 'income'),
    };

    const batches: { options: Record<string, string | null>; groups: AiGroup[] }[] = [];
    const top = groups.filter((g) => !MASKED_CARD.test(g.description)).sort((a, b) => b.rows - a.rows).slice(0, MAX_GROUPS_PER_PREVIEW);
    for (const kind of ['expense', 'income'] as const) {
      const options = optionsByKind[kind];
      // Yalnız "__none__" qalıbsa və ya Jev-in variant limiti aşılıbsa, sual verməyin mənası yoxdur.
      const optionCount = Object.keys(options).length;
      if (optionCount < 2 || optionCount > JEV_MAX_CHOICE_OPTIONS) continue;

      const ofKind = top.filter((g) => (g.direction === 'debit' ? 'expense' : 'income') === kind);
      for (let i = 0; i < ofKind.length; i += BATCH_SIZE) {
        batches.push({ options, groups: ofKind.slice(i, i + BATCH_SIZE) });
      }
    }
    // Ən çox sətri əhatə edən batch-lar əvvəl (vaxt büdcəsi bitsə, ən dəyərli hissə artıq hazırdır).
    batches.sort((a, b) => b.groups[0].rows - a.groups[0].rows);

    const deadline = Date.now() + AI_TIME_BUDGET_MS;
    let next = 0;
    let consecutiveFailures = 0;
    const worker = async () => {
      while (next < batches.length && Date.now() < deadline && consecutiveFailures < MAX_CONSECUTIVE_BATCH_FAILURES) {
        const batch = batches[next++];
        const reachedJev = await this.suggestBatch(batch.groups, batch.options, result, deadline);
        consecutiveFailures = reachedJev ? 0 : consecutiveFailures + 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

    return result;
  }

  /** Bir Jev sorğusunda `groups`-un hər biri üçün ayrı sual verir. `false` = bütün cəhdlər uğursuz oldu. */
  private async suggestBatch(
    groups: AiGroup[],
    options: Record<string, string | null>,
    result: Map<string, AiSuggestion>,
    deadline: number,
  ): Promise<boolean> {
    const clean = (text: string) => text.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
    const lines = groups.map((g, i) => `${i + 1}. ${clean(g.description)} | ${g.direction === 'debit' ? 'xərc' : 'gəlir'} | ${g.amount}`);
    const state = `Bank əməliyyatlarının təyinatları (nömrə. təyinat | növ | məbləğ):\n${lines.join('\n')}`;
    const questions = Object.fromEntries(
      groups.map((g, i) => [
        `q${i}`,
        {
          instructions: `${i + 1}-ci sətirdəki "${clean(g.description)}" təyinatı hansı kateqoriyaya aiddir? Heç biri uyğun deyilsə, "${NO_CATEGORY_LABEL}" seçin.`,
          options,
        },
      ]),
    );

    let answers: Awaited<ReturnType<JevClient['choose']>> = null;
    for (let attempt = 0; attempt <= RETRIES_PER_BATCH && !answers; attempt++) {
      if (attempt > 0) {
        if (Date.now() + RETRY_DELAY_MS >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
      answers = await this.jev.choose(state, questions);
    }
    if (!answers) return false;

    groups.forEach((group, i) => {
      const answer = answers[`q${i}`];
      if (!answer) return;
      if (answer.choice === NO_CATEGORY_LABEL) return;
      if (answer.confidence < JEV_CONFIDENCE_THRESHOLD) return;
      if (!Object.hasOwn(options, answer.choice)) return;
      result.set(group.key, { categoryId: answer.choice, confidence: answer.confidence });
    });
    return true;
  }

  /** label = kateqoriya id-si, izah = tam yol adı ("Yemək › Market") + sonda "heç biri" variantı. */
  private buildOptions(categories: Category[], kind: CategoryKind): Record<string, string | null> {
    const pathOf = createCategoryPathResolver(categories);

    const options: Record<string, string | null> = {};
    categories
      .filter((c) => c.kind === kind && c.name !== INTERNAL_TRANSFER_CATEGORY_NAME)
      .map((c) => ({ id: c.id, path: pathOf(c) }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .forEach(({ id, path }) => {
        options[id] = path;
      });

    options[NO_CATEGORY_LABEL] = 'Heç bir kateqoriya uyğun deyil';
    return options;
  }
}
