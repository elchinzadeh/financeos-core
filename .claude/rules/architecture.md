# Architecture qaydaları — Command → Event → Projection

## Məcburi qayda

- Hər state-dəyişdirən əməliyyat bir **command**-dır: `recordExpense`, `recordIncome`, `transferBetweenAccounts`, `createGoal`, `updateBudget` və s. Command-lar core API-nin yeganə yazma nöqtəsidir.
- Heç bir client (mobile, web, ai_chat, gələcəkdə mcp, api) və heç bir modul `accounts`, `ledger_entries`, `budgets`, `goals` cədvəllərinə birbaşa `UPDATE`/`INSERT`/`DELETE` etmir. Bunu etmək istəyəndə — dayan, əvəzinə command yaz.
- Hər command icra olunanda `events` cədvəlinə bir sətir əlavə olunur (append-only, heç vaxt update/delete edilmir). `payload` — command-ın inputu; `client_id` — kimin çağırdığı (mobile, web, ai_chat...).
- Read model-lər (`account_balances`, net worth, hesabatlar) `events`-dən törənən **projeksiyalardır**. İstənilən vaxt `events`-dən yenidən qurula bilməlidirlər — onlara cache kimi bax, "həqiqət mənbəyi" kimi yox.
- Yeni client tipi (MCP, bank sync, OCR) əlavə etmək = mövcud command-ları çağırmaq, yeni yazma yolu açmaq yox.

## Yeni command əlavə edəndə

1. `event_type` adını təyin et — keçmiş zamanda, PascalCase (`ExpenseRecorded`, `TransferExecuted`, `GoalCreated`).
2. Bu event-i emal edəcək projector(lar)ı yaz/yenilə (məs. `ledger_entries`, `account_balances`).
3. `docs/MODULES.md`-də aid olduğu modulun sətrini yenilə.
4. Bununla yaranan yeni asılılıq varsa, `.claude/rules/module-dependencies.md`-dəki cədvələ əlavə et.
5. Event-i bir DB transaksiyası daxilində, ona uyğun projeksiya yazısı ilə birgə yaz — bax `.claude/rules/database.md`.

## Pul və valyuta

- `numeric`, heç vaxt float/double.
- Hər `ledger_entries` sətri öz `fx_rate_to_base`-ini yazıldığı andakı dəyərlə dondurub saxlayır — sonradan kurs dəyişsə belə, keçmiş sətir dəyişmir.

## NestJS-də necə görünür

- Command = `@nestjs/cqrs`-dəki `ICommand` + `CommandHandler`. Handler `events` cədvəlinə yazır və uyğun projeksiyanı yeniləyir — **eyni Prisma `$transaction` daxilində**, iki ayrı addım kimi yox.
- `@nestjs/cqrs`-in öz `EventBus`-u proses-daxili (in-memory) dispatch mexanizmidir, özü heç nəyi saxlamır. `events` cədvəlinə yazma məsuliyyəti bizim öz kodumuzdadır — CQRS modulunu istifadə etsək belə, persistensiyanı əlimizlə edirik, ona etibar etmirik.
- Hər konseptual modul (`docs/MODULES.md`-dəki) öz NestJS modulu olsun: `src/modules/ledger/`, `src/modules/accounts/` və s. — bu, `.claude/rules/module-dependencies.md`-dəki xəritəni kodda görünən edir.

## Nə vaxt bu qaydanı pozmaq olar

Heç vaxt. Performans problemi varsa (məs. balans hesablamaq yavaşdır) — həll `account_balances` cache-ini optimallaşdırmaqdır, command layer-i bypass etmək deyil.

Bax həmçinin: `docs/decisions/0001-event-sourced-command-layer.md`, `docs/decisions/0002-double-entry-ledger.md`
