import { describe, expect, it } from 'vitest';
import { matchRule, type MatchableRule } from './category-rule-matcher.js';

const rule = (keyword: string, categoryId: string, kind: 'income' | 'expense' = 'expense'): MatchableRule => ({
  keyword,
  categoryId,
  category: { kind },
});

describe('matchRule', () => {
  it('təsvirdə açar sözü böyük-kiçik hərfə həssas olmadan tapır', () => {
    const rules = [rule('Bravo', 'food')];
    expect(matchRule(rules, 'POS BRAVO SUPERMARKET BAKU', 'expense')?.categoryId).toBe('food');
  });

  it('bir neçə uyğunluq olanda ən uzun açar söz qalib gəlir', () => {
    const rules = [rule('Bolt', 'transport'), rule('Bolt Food', 'food')];
    expect(matchRule(rules, 'Bolt Food order 123', 'expense')?.categoryId).toBe('food');
    expect(matchRule(rules, 'Bolt ride 456', 'expense')?.categoryId).toBe('transport');
  });

  it('yalnız istənilən növdəki kateqoriyaların qaydalarını nəzərə alır', () => {
    const rules = [rule('Upwork', 'freelance', 'income'), rule('Upwork', 'tools', 'expense')];
    expect(matchRule(rules, 'Upwork payout', 'income')?.categoryId).toBe('freelance');
    expect(matchRule(rules, 'Upwork payout', 'expense')?.categoryId).toBe('tools');
  });

  it('uyğun qayda yoxdursa null qaytarır', () => {
    expect(matchRule([rule('Bravo', 'food')], 'Naməlum tacir', 'expense')).toBeNull();
    expect(matchRule([], 'Bravo', 'expense')).toBeNull();
  });

  it('qayda üzərindəki əlavə sahələri saxlayır (generic)', () => {
    const rules = [{ ...rule('Spar', 'food'), id: 'r1' }];
    expect(matchRule(rules, 'Spar market', 'expense')?.id).toBe('r1');
  });
});
