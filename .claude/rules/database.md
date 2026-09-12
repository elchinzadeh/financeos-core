# Verilənlər bazası konvensiyaları

- Postgres. UUID primary key-lər.
- Cədvəl/sütun adları `snake_case`, cədvəl adları cəm (`accounts`, `ledger_entries`, `fx_rates`).
- Pul: `numeric`, heç vaxt `float`/`double`.
- Event-sourced yazı bir DB transaksiyası daxilində olur: əvvəl `events`-ə insert, sonra ona uyğun projeksiya sətirləri (`ledger_entries`, `account_balances`). Projeksiya yazısı uğursuz olsa, bütün transaksiya geri qaytarılır — `events`-də heç vaxt projeksiyasız qalan sətir olmamalıdır.
- `events.event_type` dəyərləri keçmiş zamanda PascalCase mətn kimi saxlanılır (`ExpenseRecorded`, `TransferExecuted`), DB enum kimi yox — yeni event tipi əlavə etmək migration tələb etməsin deyə.
- Yeni sütunlar nullable + backfill ilə əlavə olunur, `ledger_entries` üzərində bloklayan (lock tutan) rewrite etmə — bu, ən böyük və ən çox yazılan cədvəl olacaq.
- Hər `ledger_entries` sətri öz `fx_rate_to_base`-ini yazıldığı andakı dəyərlə saxlayır (immutable) — bax `.claude/rules/architecture.md`.
- `account_balances` bir cache-dir, `events`-dən istənilən vaxt yenidən qurula bilməlidir (reconciliation job).

## Prisma qeydləri

- Sxem: `prisma/schema.prisma`. Migrasiyalar: `pnpm prisma migrate dev` (development), `pnpm prisma migrate deploy` (production).
- Pul sahələri Prisma-da `Decimal` tipi ilə (`@db.Decimal(...)`), heç vaxt `Float`.
- `events.payload` Prisma `Json` tipi.
- Event + projeksiya yazısı `prisma.$transaction(async (tx) => { ... })` daxilində edilir — hər ikisi uğurlu olmalı, ya da hər ikisi geri qaytarılmalıdır.

Tam cədvəl siyahısı və sxem: `docs/MODULES.md`
Niyə bu sxem seçildi: `docs/decisions/0001-event-sourced-command-layer.md`, `docs/decisions/0002-double-entry-ledger.md`, `docs/decisions/0004-multi-currency-fx-snapshot.md`
