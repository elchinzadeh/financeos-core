import { Injectable, Logger } from '@nestjs/common';
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

/** Jev-in `Choice` sualı üçün dəstəklədiyi maksimum variant sayı (docs.typesafe.ai). */
export const JEV_MAX_CHOICE_OPTIONS = 255;

/** Bu həddən aşağı confidence ilə gələn cavab "təklif yoxdur" sayılır. Pilotda kalibrlənəcək (ADR-0021). */
export const JEV_CONFIDENCE_THRESHOLD = 0.7;

const JEV_TIMEOUT_MS = 3_000;
/**
 * Bütün cəhdlər (SDK retry-ları daxil) üçün sərt üst hədd. SDK-nın `timeout`-u yalnız tək cəhdi məhdudlaşdırır;
 * 429/503 cavabında `Retry-After` ilə retry ~1 dəqiqə gözləyə bilirdi (real Leobank faylı ilə pilotda görüldü).
 */
const JEV_HARD_DEADLINE_MS = 6_000;

export interface JevChoiceQuestion {
  instructions: string;
  /** label → izah. Label-lər unikal olmalıdır (məs. kateqoriya id-si), izah modelə kömək edir. */
  options: Record<string, string | null>;
}

export interface JevChoiceAnswer {
  choice: string;
  /** 0–1 */
  confidence: number;
}

/**
 * TypeSafe Jev üzərində nazik təbəqə (bax docs/decisions/0021-jev-ai-suggestions.md).
 *
 * Jev mətn yaratmır — yalnız əvvəlcədən verilmiş variantlardan birini seçir. Xəta atmır: açar yoxdursa,
 * provayder əlçatan deyilsə və ya sorğu limitindən keçibsə `null` qaytarır, çağıran tərəf AI-sız davam edir
 * (EmailService/FxSyncService ilə eyni "best-effort" fəlsəfəsi). Testlərdə `overrideProvider` ilə əvəzlənir.
 */
@Injectable()
export class JevClient {
  private readonly logger = new Logger(JevClient.name);
  private client: TypeSafeClient | null = null;

  isEnabled(): boolean {
    return Boolean(process.env.TYPESAFE_API_KEY?.trim());
  }

  /**
   * Bir sorğuda bir neçə `Choice` sualı verir (Jev onları paralel və təcrid olunmuş cavablandırır).
   * Cavab açarları `questions`-ın açarlarıdır. Hər hansı problemdə `null`.
   */
  async choose(
    state: string | Record<string, string>,
    questions: Record<string, JevChoiceQuestion>,
  ): Promise<Record<string, JevChoiceAnswer> | null> {
    if (!this.isEnabled()) return null;

    const names = Object.keys(questions);
    if (names.length === 0) return null;

    const built: Record<string, ReturnType<typeof choice>> = {};
    for (const name of names) {
      const { instructions, options } = questions[name];
      const count = Object.keys(options).length;
      if (count < 1 || count > JEV_MAX_CHOICE_OPTIONS) {
        this.logger.warn(`Jev sualı ötürüldü (${name}): variant sayı ${count}, icazə verilən 1–${JEV_MAX_CHOICE_OPTIONS}`);
        return null;
      }
      built[name] = choice(instructions, options);
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${JEV_HARD_DEADLINE_MS} ms limitini aşdı`)), JEV_HARD_DEADLINE_MS);
      });
      const response = await Promise.race([
        this.getClient().systemOne({ state, questions: built }, { timeout: JEV_TIMEOUT_MS }),
        deadline,
      ]);

      const result: Record<string, JevChoiceAnswer> = {};
      for (const name of names) {
        const answer = response.answers[name];
        if (answer?.type !== 'choice') return null;
        result[name] = { choice: answer.choice, confidence: answer.confidence };
      }
      return result;
    } catch (err) {
      this.logger.error(`Jev sorğusu uğursuz oldu: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private getClient(): TypeSafeClient {
    if (!this.client) {
      this.client = new TypeSafeClient({
        apiKey: process.env.TYPESAFE_API_KEY,
        // Model versiyası sabitlənir: `jev-latest` həddləri xəbərsiz dəyişə bilər (ADR-0021).
        defaultModel: process.env.JEV_MODEL?.trim() || undefined,
        timeout: JEV_TIMEOUT_MS,
        retry: { maxRetries: 1 },
      });
    }
    return this.client;
  }
}
