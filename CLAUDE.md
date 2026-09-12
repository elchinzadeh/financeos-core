# Fərdi Maliyyə Platforması — Layihə Konteksti

Fərdi (və freelancer) istifadəçilər üçün maliyyə idarəetmə platforması: mobil app, veb app, AI chat, gələcəkdə MCP və developer API — hamısı **bir core backend**-in üzərində client kimi işləyir.

## Əsas memarlıq qaydası: Command → Event → Projection

Heç bir client (mobile, web, ai_chat, gələcəkdə mcp/api) birbaşa cədvələ yazmır. Hər dəyişiklik bir **command**-dır (`recordExpense`, `transferBetweenAccounts`, `createGoal`...). Command bir **event** yaradır (`events` cədvəli, append-only, heç vaxt update/delete olunmur). Balanslar, net worth, hesabatlar — hamısı bu event-lərdən hesablanan **projeksiya**dır, "həqiqət" deyil, cache-dir.

Ətraflı: `.claude/rules/architecture.md`

## Modullar

Identity & Access · Accounts · Ledger (events + ledger_entries) · Categories · Currency & FX · Net Worth & Reporting · Budget & Rules · Goals · AI Assistant (bir client, ayrıca modul deyil)

- Hər modulun funksiyaları, cədvəlləri: `docs/MODULES.md`
- Modullar arası asılılıq (nəyi dəyişəndə nəyi yoxlamaq lazımdır): `.claude/rules/module-dependencies.md`

## MVP əhatəsi

**İndi qurulur:** Identity, Accounts, Ledger, Categories, Currency & FX (gündəlik kurs), Net Worth (sadə görünüş), Budget (2-3 hardcoded şablon — 50/30/20 tipli), Goals (statik məbləğ), AI chat client.

**Bilərəkdən sonraya saxlanılıb** (amma data modeli buna yer saxlayır): rule builder UI, MCP write-access + confirmation axını, bank/fintech inteqrasiyaları (Plaid/Salt Edge/Wise/Payoneer), OCR, SMS parsing, granular permission UI, investisiya hesabları, ayrıca Debt/Credit modulu (MVP-də sadəcə `accounts.type='loan'`).

Niyə belə qərar verildiyi: `docs/decisions/0003-mvp-scope.md`

## İşə başlamazdan əvvəl

1. `docs/PROGRESS.md`-i oxu — hansı modul harada qalıb, növbəti addım nədir.
2. Toxunacağın modul üçün `docs/MODULES.md`-də onun sətrini oxu — funksiyaları, cədvəlləri, kimə asılı olduğunu.
3. Bu modula asılı olan başqa modullar varsa (`.claude/rules/module-dependencies.md`), dəyişiklikdən sonra onların testlərini də işə sal.

## Qərarları yazılı saxla

Memarlıq/dizayn qərarı verəndə (yeni cədvəl, mövcud sxemi dəyişmək, yeni yanaşma seçmək) bunu sadəcə chat-da izah etmə — `docs/decisions/TEMPLATE.md`-dən istifadə edərək `docs/decisions/000N-qisa-ad.md` yarat, ya da mövcud olanı yenilə (status: superseded). İşə başlamazdan əvvəl `docs/decisions/`-a nəzər sal ki, artıq qərar verilmiş bir şeyə zidd getməyəsən.

## Pul və valyuta

- Məbləğlər `numeric`, heç vaxt float/double.
- Hər `ledger_entries` sətri yaradıldığı andakı FX kursunu (`fx_rate_to_base`) dondurub saxlayır — keçmiş əməliyyatı bugünkü kursla yenidən hesablama.

## Texnologiya stack-i

- **Backend / core API:** NestJS (TypeScript), `@nestjs/cqrs` command/event dispatch üçün
- **DB:** PostgreSQL · **ORM:** Prisma
- **Repo:** tək NestJS repo (monorepo yox, hələlik)
- **API üslubu:** REST + OpenAPI (Swagger) — hər endpoint `@nestjs/swagger` ilə sənədləşdirilir
- **Paket meneceri:** pnpm

Bax `docs/decisions/0006-backend-stack.md`, `docs/decisions/0007-repo-api-tooling.md`. **Hələ açıq:** mobil/veb frontend seçimi — bax `docs/PROGRESS.md`.

## Test və təhlükəsizlik

- `events`/`ledger_entries`-ə toxunan hər dəyişiklik üçün test — nəticə projeksiyasını yoxlayan, təkcə "xəta atmadı" yox.
- Modullar arası dəyişiklikdə: asılılıq cədvəlinə bax, təsirlənən modulların testlərini də işə sal.

Ətraflı: `.claude/rules/testing.md`, `.claude/rules/database.md`

## Bu faylı necə saxlamaq lazımdır

Bu faylı ~150-200 sətirdən uzun etmə. Mövzuya görə detallı qaydalar `.claude/rules/`-a, uzun istinad materialı `docs/`-a gedir. Kod bazası böyüdükcə `/doctor` ilə bu faylı nəyin çıxarıla biləcəyinə görə yoxla.
