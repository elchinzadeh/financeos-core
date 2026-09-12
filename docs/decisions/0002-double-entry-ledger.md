# ADR-0002: Double-entry `ledger_entries`, tək işarəli balans sütunu yox

Tarix: 2026-09-12
Status: accepted

## Kontekst

Hesablar arası köçürmələr, çox-valyutalı hesablar və istənilən tarixə restore dəstəklənməlidir. Balansı harada və necə saxlamaq lazımdır ki, köçürmələr aydın, konsistent və audit-lənə bilən olsun?

## Qərar

`ledger_entries` cədvəli double-entry məntiqi ilə qurulur: hər sətirdə `account_id`, `direction` (`debit`/`credit`), `amount`, `currency`, `fx_rate_to_base` (yazıldığı andakı dəyərlə dondurulmuş). Köçürmələr iki sətirdən ibarətdir, ortaq `transaction_group_id` ilə bağlanır. Balanslar bu sətirlərin agregasiyasıdır, performans üçün `account_balances` cədvəlində cache olunur, amma istənilən vaxt `events`-dən yenidən qurula bilər.

## Baxılan alternativlər

- **Tək işarəli (`+`/`-`) `amount` sütunu, `direction` olmadan** — rədd edildi: köçürmələrdə işarə səhvləri asan yaranır, reconciliation çətinləşir.
- **Balansı birbaşa `accounts` cədvəlində saxlamaq, hər əməliyyatda in-place update etmək** — rədd edildi: tarixçəni itirir, istənilən tarixə restore mümkün olmur, ADR-0001-dəki event-sourcing prinsipinə ziddir.

## Nəticələr

- Hesabat/net worth sorğuları agregasiya sorğularıdır, sadə `SELECT balance FROM accounts` deyil — bu, `account_balances` cache-inin niyə lazım olduğunu izah edir.
- `fx_rate_to_base` hər sətirdə donduğu üçün keçmiş hesabatlar bugünkü kurs dəyişikliyindən təsirlənmir (bax ADR-0004).
- `account_balances` cache-i vaxtaşırı `events`-dən reconciliation job ilə yenidən qurulmalıdır ki, səhv düşsə belə "həqiqət mənbəyi" toxunulmaz qalsın.
