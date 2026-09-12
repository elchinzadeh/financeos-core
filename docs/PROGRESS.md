# Progress

Bu fayl status lövhəsidir, changelog deyil (dəyişikliklərin tarixçəsi üçün git-ə bax). Mənalı bir iş bitəndə, ya da scope-a dair qərar veriləndə bu faylı yenilə. Qısa yaz — bir sətir kifayətdir, detal lazımdırsa ADR-ə keçid ver.

## Modul statusu

| Modul | Status | Qeyd |
|---|---|---|
| Identity & Access | Tətbiq olundu (register/login/logout/me/deactivate/delete-data) | `src/modules/identity/` — `SessionAuthGuard`, opaque hash-lənmiş sessiya token-i (bax `docs/decisions/0009-identity-auth-strategy.md`). Deaktivasiya/data silinməsi bax `docs/decisions/0013-account-deactivation-and-reconciliation.md`. Parol sıfırlama hələ yoxdur (email provider tələb edir) |
| Accounts | Tətbiq olundu (open/list/get/archive) | Event-sourced (`OpenAccount`/`ArchiveAccount` command-ları, bax `docs/decisions/0010-ledger-command-layer.md`) |
| Ledger | Tətbiq olundu (income/expense/transfer/adjust/reconcile) | `@nestjs/cqrs`, `events`+`ledger_entries`+`account_balances`. `POST /ledger/reconcile` balans cache-ini yenidən qurur (bax `docs/decisions/0013-account-deactivation-and-reconciliation.md`) |
| Categories | Tətbiq olundu (minimal) | CRUD + 8 sistem default kateqoriyası (`prisma/seed.ts`, `pnpm db:seed`). İyerarxiya/AI-təklif UI-si yoxdur |
| Currency & FX | Tətbiq olundu (minimal) | `POST/GET /fx-rates` əl ilə kurs daxiletmə + tərs-kurs fallback-ı. Xarici mənbədən gündəlik avtomatik yenilənmə (cron) hələ yoxdur |
| Net Worth & Reporting | Tətbiq olundu (minimal) | `GET /net-worth`, `/timeline`, `/category-summary` — öz cədvəli yoxdur, `ledger_entries`+`fx_rates` üzərində agregasiya (bax `docs/decisions/0011-net-worth-fx-strategy.md`) |
| Budget & Rules (yalnız şablonlar) | Tətbiq olundu | Event-sourced, `percent` = dövr gəlirinin faizi, `GET /budgets/:id/check` limit aşımını aşkarlayır (bax `docs/decisions/0012-budget-rules.md`) |
| Goals (statik məbləğ) | Tətbiq olundu | Event-sourced (`CreateGoal`/`CompleteGoal`/`AbandonGoal`), tərəqqi `linkedAccountId`-in balansından canlı FX ilə hesablanır |
| AI Assistant (chat client) | Başlanmayıb | |

## Növbəti addımlar

- [x] Backend stack seçildi: NestJS + PostgreSQL + Prisma, `@nestjs/cqrs` (bax `docs/decisions/0006-backend-stack.md`)
- [x] Repo strukturu, API üslubu, paket meneceri seçildi: tək repo, REST+OpenAPI, pnpm (bax `docs/decisions/0007-repo-api-tooling.md`)
- [x] `pnpm` ilə NestJS layihəsini scaffold et, Prisma + Swagger modullarını qur (bax `docs/decisions/0008-module-folder-naming.md`)
- [x] Mobil/veb frontend seçimini müəyyənləşdir (bax `financeos-web/docs/decisions/0001-frontend-foundation.md`, backend-ə toxunan CORS addımı üçün `docs/decisions/0014-cors-for-web-client.md`)
- [x] Identity & Access-i tətbiq et (bax `docs/decisions/0009-identity-auth-strategy.md`)
- [x] Accounts + Ledger-i birgə tətbiq et (minimal Categories + Currency & FX daxil, bax `docs/decisions/0010-ledger-command-layer.md`)
- [ ] Parol sıfırlama axını — **bloklanıb**: email göndərmə üçün provider (SMTP/SendGrid və s.) + credential lazımdır, istifadəçidən təmin edilməlidir
- [x] Hesab deaktivasiyası / məlumatların silinməsi (bax `docs/decisions/0013-account-deactivation-and-reconciliation.md`)
- [x] `account_balances`-in `events`-dən reconciliation (yenidən qurma) job-u (`POST /ledger/reconcile`)
- [ ] Currency & FX: xarici mənbədən gündəlik avtomatik kurs yeniləmə (cron) — **bloklanıb**: real FX API (məs. exchangerate.host, Fixer) açarı lazımdır, istifadəçidən təmin edilməlidir; indi əl ilədir
- [ ] Categories: iyerarxiya UI-si, AI avtomatik-kateqoriyalaşdırma təklifi
- [x] Net Worth & Reporting-i tətbiq et (bax `docs/decisions/0011-net-worth-fx-strategy.md`)
- [ ] Net Worth: böyük tarix aralıqlı timeline sorğuları üçün performans (materialized view/snapshot cədvəli)
- [x] Budget & Rules-u tətbiq et (bax `docs/decisions/0012-budget-rules.md`)
- [ ] Budget: rule builder UI (`definition` formatı artıq hazır saxlanılıb)
- [x] Goals-u tətbiq et (statik hədəf məbləği)
- [ ] Goals: xatırlatma/bildiriş trigger-ləri (gələcək)
- [ ] AI Assistant client-i tətbiq et (mövcud command-ları çağıran chat client)
- [x] Veb frontend (`C:\Projects\financeos-web`, ayrı repo, Next.js) Slice 1 — auth (register/login/logout) + Dashboard (net worth) + Accounts (list/open/archive), bax `financeos-web/docs/PROGRESS.md`. Ledger/Categories/Budget/Goals/Settings səhifələri həmin repo-da növbəti slice-lərdə

## Log

*(ən yenisi əvvəldə — sessiya/qərar başına bir sətir, aidiyyatı olan ADR-ə keçid ver)*

- Veb frontend üçün stack/repo/auth qərarı verildi: Next.js, ayrıca repo (`financeos-web`), Bearer token (bax `financeos-web/docs/decisions/0001-frontend-foundation.md`). Backend-də tək dəyişiklik: `app.enableCors()` (`src/main.ts`) — yeni client tipi qoşulur, endpoint/auth məntiqi dəyişmir (bax `docs/decisions/0014-cors-for-web-client.md`). Frontend scaffold-u və Slice 1 (auth+dashboard+accounts) `financeos-web` repo-sunda gedir.
- Hesab deaktivasiyası/data silinməsi və balans reconciliation tətbiq olundu: `POST /auth/deactivate` (parol təsdiqi, bütün sessiyaları ləğv edir, login-i bloklayır), `POST /auth/delete-data` (parol təsdiqi, bütün user-scoped sətirləri — `events` daxil — geri dönməz silir, ADR-0001-in "events silinmir" qaydasını GDPR üçün bilərəkdən pozur), `POST /ledger/reconcile` (`account_balances`-i `ledger_entries`-dən yenidən hesablayır, event yaratmır). Parol sıfırlama və FX cron xarici provider/API açarı tələb etdiyi üçün bloklanmış olaraq qalır (bax `docs/decisions/0013-account-deactivation-and-reconciliation.md`). 39 e2e test (10 fayl) yaşıl.
- Budget & Rules tətbiq olundu: `GET /budgets/templates` (2 hardcoded — `50/30/20`, `70/20/10`), `POST /budgets`, `GET /budgets`, `GET /budgets/:id`, `GET /budgets/:id/check`, `/priority`, `/deactivate`. `budgets` protected cədvəl — event-sourced (`CreateBudget`/`UpdateBudgetPriority`/`DeactivateBudget`). `percent` dövr gəlirinin faizidir (istifadəçi ilə təsdiqləndi), allocation-lar yalnız expense-kateqoriyalara ola bilər (bax `docs/decisions/0012-budget-rules.md`). 34 e2e test (9 fayl) yaşıl.
- Goals tətbiq olundu: `POST /goals`, `GET /goals`, `GET /goals/:id`, `/complete`, `/abandon`. `goals` protected cədvəl olduğu üçün (Accounts-dakı kimi) event-sourced — `CreateGoal`/`CompleteGoal`/`AbandonGoal` command-ları. Tərəqqi ayrıca saxlanmır, `linkedAccountId`-in balansı canlı FX kursu ilə `targetCurrency`-ə çevrilərək sorğu zamanı hesablanır (Net Worth-dakı eyni "stok" məntiqi, bax `docs/decisions/0011-net-worth-fx-strategy.md`). 31 e2e test (8 fayl) yaşıl.
- Net Worth & Reporting tətbiq olundu: `GET /net-worth` (cari/`asOf`), `/net-worth/timeline` (gün/həftə/ay, max 366 nöqtə), `/net-worth/category-summary` (dövr üzrə). Net worth canlı (tarixli) FX kursu ilə, kateqoriya hesabatı donmuş `fx_rate_to_base` ilə hesablanır; arxivlənmiş hesablar daxildir (bax `docs/decisions/0011-net-worth-fx-strategy.md`). 27 e2e test (7 fayl) yaşıl.
- Accounts + Ledger + minimal Categories/Currency & FX tətbiq olundu: `@nestjs/cqrs` ilə `OpenAccount`/`ArchiveAccount`/`RecordIncome`/`RecordExpense`/`TransferBetweenAccounts`/`AdjustBalance` command-ları, `events`+`ledger_entries`+`account_balances` (hesabın öz valyutasında), FX axtarışı (eyni-valyuta qısayolu + tərs-kurs fallback-ı, tapılmasa aydın xəta), 8 sistem default kateqoriyası seed edildi (bax `docs/decisions/0010-ledger-command-layer.md`). 22 e2e test (6 fayl) yaşıl.
- Identity & Access tətbiq olundu: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; opaque + SHA-256 hash-lənmiş sessiya token-ləri, `bcryptjs` ilə parol hashing, `SessionAuthGuard` (bax `docs/decisions/0009-identity-auth-strategy.md`). Parol sıfırlama və hesab deaktivasiyası bilərəkdən kənarda saxlanıldı.
- NestJS layihəsi scaffold edildi (Nest 12, ESM, `pnpm`), Prisma 7 (driver adapter — `@prisma/adapter-pg`) və `@nestjs/swagger` quruldu; `prisma/schema.prisma`-da Identity & Access + Accounts cədvəlləri yazıldı və `financeos_dev`-ə migrate edildi; 8 modul üçün boş skeleton yaradıldı (bax `docs/decisions/0008-module-folder-naming.md`). Server boot və Swagger UI (`/api`) yoxlanıldı.
- Repo strukturu (tək repo), API üslubu (REST+OpenAPI) və paket meneceri (pnpm) qərarlaşdırıldı (bax `docs/decisions/0007-repo-api-tooling.md`).
- Backend stack qərarı verildi: NestJS + PostgreSQL + Prisma, `@nestjs/cqrs` command/event dispatch üçün (bax `docs/decisions/0006-backend-stack.md`).
- Layihə başladı: memarlıq (Command→Event→Projection), MVP scope və DB sxemi müəyyənləşdirildi (bax `docs/decisions/0001`–`0004`). Kod hələ yazılmayıb.
