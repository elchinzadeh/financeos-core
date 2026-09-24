export type ParserWarning = 'amount_missing' | 'multiple_amounts';
export type SupportedCurrency = 'AZN' | 'USD' | 'EUR';

export interface ParsedTransactionText {
  /** Normallaşdırılmış onluq mətn ("45.90"), tapılmadısa null. */
  amount: string | null;
  /** Mətndə tam bir valyuta aşkarlanıbsa o, yoxsa null (bir neçə fərqli valyuta da null verir). */
  currency: SupportedCurrency | null;
  /** 0 = bu gün, -1 = dünən, -2 = srağagün. Tarixi client hesablayır (users-də timezone yoxdur). */
  dayOffset: number;
  /** Məbləğ, valyuta, gün və əməliyyat feillərindən təmizlənmiş qalıq mətn. */
  note: string;
  warnings: ParserWarning[];
}

/**
 * Serbəst mətndən məbləğ, valyuta, gün və qeydi çıxarır — deterministik, LLM-siz (ADR-0021).
 *
 * Bilərəkdən dar tutulub: sözlə yazılmış rəqəmləri ("qırx beş"), sərbəst tarix ifadələrini ("keçən cümə") və
 * bir neçə əməliyyatı tanımır. Belə hallarda `amount_missing`/`multiple_amounts` xəbərdarlığı qaytarılır və
 * çağıran tərəf Claude ehtiyatına keçir.
 */

// Tarix/saat kimi rəqəm qruplarını məbləğ sanmamaq üçün skan etməzdən əvvəl boşluqla əvəz olunur (uzunluq saxlanılır).
const DATE_OR_TIME_RE = /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|\d{1,2}:\d{2}(?::\d{2})?/g;

// "1 250,50", "1.250,50", "1,250.50" (min. bir 3 rəqəmli qrup ilə minlik ayırıcı) və ya "45", "45.90", "45,9".
const AMOUNT_RE = /(?<![\p{L}\d.,])(\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/gu;

const CURRENCY_PATTERNS: { code: SupportedCurrency; re: RegExp }[] = [
  { code: 'AZN', re: /(?<!\p{L})manat\p{L}*|(?<!\p{L})azn(?!\p{L})|(?<!\p{L})man(?!\p{L})|₼/giu },
  { code: 'USD', re: /(?<!\p{L})dollar\p{L}*|(?<!\p{L})dolar\p{L}*|(?<!\p{L})usd(?!\p{L})|\$/giu },
  { code: 'EUR', re: /(?<!\p{L})avro\p{L}*|(?<!\p{L})euro\p{L}*|(?<!\p{L})eur(?!\p{L})|€/giu },
];

const DAY_PATTERNS: { offset: number; re: RegExp }[] = [
  { offset: -2, re: /(?<!\p{L})(?:srağagün|sragagun|srağa gün)(?!\p{L})/giu },
  { offset: -1, re: /(?<!\p{L})(?:dünən|dunen)(?!\p{L})/giu },
  { offset: 0, re: /(?<!\p{L})(?:bu gün|bugün|bugun)(?!\p{L})/giu },
];

// Əməliyyat feilləri istiqaməti bildirir, qeydin özü deyil — qeyddən çıxarılır (istiqaməti Jev/Claude seçir).
const VERB_RE = /(?<!\p{L})(?:xərclədim|xərc etdim|ödədim|aldım|qazandım)(?!\p{L})/giu;

interface Range {
  start: number;
  end: number;
}

interface CurrencyMatch extends Range {
  code: SupportedCurrency;
  symbol: boolean;
}

const mask = (text: string, re: RegExp): string => text.replace(re, (m) => ' '.repeat(m.length));

/** "1.250,50" → "1250.50", "45,9" → "45.9", "1 250" → "1250". Sıfır və ya oxunmayan dəyər üçün null. */
export function normalizeAmountToken(token: string): string | null {
  const compact = token.replace(/[  ]/g, '');
  const lastSeparator = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf(','));

  let integerPart = compact;
  let fractionPart = '';
  if (lastSeparator !== -1) {
    const after = compact.slice(lastSeparator + 1);
    // 1–2 rəqəm → onluq hissə; düz 3 rəqəm → minlik ayırıcı ("12.345" = 12345).
    if (after.length <= 2) {
      integerPart = compact.slice(0, lastSeparator);
      fractionPart = after;
    }
  }
  integerPart = integerPart.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  if (!/^\d+$/.test(integerPart)) return null;

  const normalized = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  return Number(normalized) > 0 ? normalized : null;
}

export function parseTransactionText(input: string): ParsedTransactionText {
  const text = input.normalize('NFC');
  const masked = mask(text, DATE_OR_TIME_RE);

  const currencyMatches: CurrencyMatch[] = [];
  for (const { code, re } of CURRENCY_PATTERNS) {
    for (const m of masked.matchAll(re)) {
      const index = m.index ?? 0;
      currencyMatches.push({ code, start: index, end: index + m[0].length, symbol: /^[$€₼]$/u.test(m[0]) });
    }
  }

  const amountTokens = [...masked.matchAll(AMOUNT_RE)]
    .map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, value: normalizeAmountToken(m[0]) }))
    .filter((token): token is { start: number; end: number; value: string } => token.value !== null);

  const warnings: ParserWarning[] = [];
  if (amountTokens.length === 0) warnings.push('amount_missing');
  if (amountTokens.length > 1) warnings.push('multiple_amounts');

  // Bir neçə rəqəm varsa, valyutaya bitişik olanı üstün tut ("2 kofe 6 manat" → 6).
  const isAdjacentToCurrency = (token: Range): boolean =>
    currencyMatches.some((c) =>
      c.symbol ? c.end >= token.start - 1 && c.end <= token.start : c.start >= token.end && c.start - token.end <= 1,
    );
  const chosen = amountTokens.find(isAdjacentToCurrency) ?? amountTokens[0] ?? null;

  const distinctCurrencies = new Set(currencyMatches.map((c) => c.code));
  const currency = distinctCurrencies.size === 1 ? [...distinctCurrencies][0] : null;

  let dayOffset = 0;
  const dayRanges: Range[] = [];
  let earliestDay = Infinity;
  for (const { offset, re } of DAY_PATTERNS) {
    for (const m of masked.matchAll(re)) {
      const index = m.index ?? 0;
      dayRanges.push({ start: index, end: index + m[0].length });
      if (index < earliestDay) {
        earliestDay = index;
        dayOffset = offset;
      }
    }
  }

  const verbRanges = [...masked.matchAll(VERB_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

  const removed: Range[] = [...currencyMatches, ...dayRanges, ...verbRanges];
  if (chosen) removed.push({ start: chosen.start, end: chosen.end });

  return {
    amount: chosen?.value ?? null,
    currency,
    dayOffset,
    note: buildNote(text, removed),
    warnings,
  };
}

/** Silinən aralıqları (üst-üstə düşənlər daxil) boşluqla əvəz edib qalıq mətni təmizləyir. */
function buildNote(text: string, removed: Range[]): string {
  let result = '';
  let cursor = 0;
  const sorted = [...removed].sort((a, b) => a.start - b.start);
  for (const range of sorted) {
    if (range.end <= cursor) continue;
    result += text.slice(cursor, Math.max(cursor, range.start)) + ' ';
    cursor = Math.max(cursor, range.end);
  }
  result += text.slice(cursor);

  return result
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, '')
    .trim();
}
