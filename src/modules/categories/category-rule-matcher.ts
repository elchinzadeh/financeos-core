import type { CategoryKind } from '../../generated/prisma/enums.js';

export interface MatchableRule {
  keyword: string;
  categoryId: string;
  category: { kind: CategoryKind };
}

/**
 * Təsvirdə açar söz qaydası axtarır: yalnız verilmiş növdəki (`income`/`expense`) kateqoriyaların qaydaları
 * nəzərə alınır, substring uyğunluğu böyük-kiçik hərfə həssas deyil, bir neçə uyğunluq varsa ən uzun açar söz
 * qalib gəlir. Bank idxalı və AI assistant eyni məntiqdən istifadə edir — pulsuz və dəqiq qayda AI-dan əvvəl
 * yoxlanılır (bax docs/decisions/0021-jev-ai-suggestions.md).
 */
export function matchRule<T extends MatchableRule>(rules: T[], description: string, kind: CategoryKind): T | null {
  const haystack = description.toLowerCase();
  const match = rules
    .filter((rule) => rule.category.kind === kind)
    .filter((rule) => haystack.includes(rule.keyword.toLowerCase()))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];
  return match ?? null;
}
