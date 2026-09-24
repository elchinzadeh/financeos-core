import { describe, expect, it } from 'vitest';
import { normalizeAmountToken, parseTransactionText } from './transaction-text.parser.js';

describe('normalizeAmountToken', () => {
  it.each([
    ['45', '45'],
    ['45.90', '45.90'],
    ['45,90', '45.90'],
    ['45,9', '45.9'],
    ['1 250,50', '1250.50'],
    ['1 250', '1250'],
    ['1.250,50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['12.345', '12345'], // 3 rəqəm → minlik ayırıcı
    ['007', '7'],
  ])('%s → %s', (token, expected) => {
    expect(normalizeAmountToken(token)).toBe(expected);
  });

  it.each(['0', '0.00', '000'])('sıfır məbləği (%s) rədd edir', (token) => {
    expect(normalizeAmountToken(token)).toBeNull();
  });
});

describe('parseTransactionText — məbləğ və valyuta', () => {
  it.each([
    ['Bravo-da 45 manat xərclədim', '45', 'AZN'],
    ['45.90 azn market', '45.90', 'AZN'],
    ['Taksi 7,5 ₼', '7.5', 'AZN'],
    ['20$ kofe', '20', 'USD'],
    ['$20 kofe', '20', 'USD'],
    ['Upwork-dən 850 dollar qazandım', '850', 'USD'],
    ['15 avro kitab', '15', 'EUR'],
    ['€15 kitab', '15', 'EUR'],
    ['Kirayə 1 250 manat ödədim', '1250', 'AZN'],
    ['Maaş 2.450,50 AZN', '2450.50', 'AZN'],
    ['Bravo 45', '45', null], // valyuta göstərilməyib
    ['45manat', '45', 'AZN'],
  ])('%s', (text, amount, currency) => {
    const parsed = parseTransactionText(text);
    expect(parsed.amount).toBe(amount);
    expect(parsed.currency).toBe(currency);
    expect(parsed.warnings).toEqual([]);
  });

  it('rəqəm yoxdursa amount_missing qaytarır', () => {
    const parsed = parseTransactionText('Bravo-da xərclədim');
    expect(parsed.amount).toBeNull();
    expect(parsed.warnings).toEqual(['amount_missing']);
  });

  it('sözlə yazılmış rəqəmi tanımır (məlum məhdudiyyət) və amount_missing verir', () => {
    expect(parseTransactionText('Qırx beş manat xərclədim').warnings).toContain('amount_missing');
  });

  it('bir neçə rəqəm varsa valyutaya bitişik olanı seçir və multiple_amounts xəbərdarlığı verir', () => {
    const parsed = parseTransactionText('2 kofe 6 manat');
    expect(parsed.amount).toBe('6');
    expect(parsed.currency).toBe('AZN');
    expect(parsed.warnings).toEqual(['multiple_amounts']);
  });

  it('bir neçə fərqli valyuta varsa valyutanı null qoyur', () => {
    expect(parseTransactionText('10 manat 5 dollar').currency).toBeNull();
  });

  it('tarix və saatı məbləğ sanmır', () => {
    const parsed = parseTransactionText('12.10.2026 15:30 Bravo 45 manat');
    expect(parsed.amount).toBe('45');
    expect(parsed.warnings).toEqual([]);
  });

  it('sıfır məbləği yox sayır', () => {
    expect(parseTransactionText('0 manat').warnings).toEqual(['amount_missing']);
  });

  it('sözün içindəki rəqəmi məbləğ saymır', () => {
    expect(parseTransactionText('Bravo24 xərclədim 30 manat').amount).toBe('30');
  });
});

describe('parseTransactionText — gün', () => {
  it.each([
    ['Bravo 45 manat', 0],
    ['Bravo 45 manat bu gün', 0],
    ['bugün Bravo 45 manat', 0],
    ['dünən Bravo 45 manat', -1],
    ['Bravo 45 manat dünən', -1],
    ['Srağagün taksi 8 manat', -2],
    ['Bravo dünənki 45 manat', 0], // "dünənki" ayrıca söz deyil — yalnız tam "dünən" tanınır
  ])('%s → dayOffset %i', (text, offset) => {
    expect(parseTransactionText(text).dayOffset).toBe(offset);
  });
});

describe('parseTransactionText — qeyd', () => {
  it('məbləğ, valyuta, gün və feili qeyddən çıxarır', () => {
    expect(parseTransactionText('Dünən Bravo-da 45 manat xərclədim').note).toBe('Bravo-da');
  });

  it('qeyd yoxdursa boş mətn qaytarır', () => {
    expect(parseTransactionText('45 manat').note).toBe('');
  });

  it('mənalı qeydi saxlayır', () => {
    expect(parseTransactionText('Kirayə 600 manat ödədim').note).toBe('Kirayə');
  });

  it('böyük hərflə yazılmış açar sözləri də tanıyır', () => {
    const parsed = parseTransactionText('BRAVO 45 MANAT DÜNƏN');
    expect(parsed.amount).toBe('45');
    expect(parsed.currency).toBe('AZN');
    expect(parsed.dayOffset).toBe(-1);
    expect(parsed.note).toBe('BRAVO');
  });
});
