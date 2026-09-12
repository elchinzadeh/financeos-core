export interface BudgetTemplateBucket {
  label: string;
  percent: number;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  buckets: BudgetTemplateBucket[];
}

/** Kod-səviyyəli statik şablonlar (docs/decisions/0003-mvp-scope.md) — DB-də saxlanmır. */
export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: '50-30-20',
    name: '50/30/20',
    buckets: [
      { label: 'Ehtiyaclar', percent: 50 },
      { label: 'İstəklər', percent: 30 },
      { label: 'Yığım', percent: 20 },
    ],
  },
  {
    id: '70-20-10',
    name: '70/20/10',
    buckets: [
      { label: 'Əsas xərclər', percent: 70 },
      { label: 'Yığım', percent: 20 },
      { label: 'Borc ödənişi', percent: 10 },
    ],
  },
];
