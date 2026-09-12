# ADR-0010: Accounts + Ledger komanda qatı, FX axtarışı, default kateqoriyalar

Tarix: 2026-09-12
Status: accepted

## Kontekst

Identity & Access-dən sonra Accounts və Ledger tətbiq olunanda aydın oldu ki, `.claude/rules/architecture.md`-dəki protected-cədvəl qadağası (`accounts`/`ledger_entries`/`budgets`/`goals`) `accounts`-u da əhatə edir — Identity-dən fərqli olaraq, hesab yaratma/arxivləmə sadə CRUD ola bilməz, event-sourced olmalıdır. Paralel olaraq, Ledger-in `fx_rate_to_base` sütunu hər sətirdə məcburi olduğu üçün (ADR-0004), minimal Currency & FX də bu mərhələdə tətbiq olundu; `category_id` nullable olsa da, `docs/decisions/0003-mvp-scope.md` Categories-i MVP-yə daxil etdiyi üçün minimal Categories də bu mərhələdə qurulub.

## Qərar

1. **`@nestjs/cqrs` indi əlavə olunur.** Identity-nin protected cədvələ toxunmadığı üçün ehtiyacı yox idi; Accounts (`accounts`) və Ledger (`ledger_entries`) isə var — hər ikisi `ICommand`/`CommandHandler` + `CommandBus` ilə yazılır (`OpenAccount`, `ArchiveAccount`, `RecordIncome`, `RecordExpense`, `TransferBetweenAccounts`, `AdjustBalance`). Event persistensiyası yenə əl ilə, hər handler daxilində `$transaction`-da (`CommandBus` özü heç nəyi saxlamır — `architecture.md`).
2. **Debit/credit işarəsi:** `credit` = balansı artırır, `debit` = azaldır. Sadələşdirilmiş şəxsi-maliyyə oxunuşudur, formal mühasibatlıq asset/liability fərqini nəzərə almır.
3. **`account_balances` hesabın öz valyutasında saxlanılır**, baza valyutaya çevrilmir. `fx_rate_to_base` yalnız gələcək Net Worth agregasiyası üçün hər sətirdə donur. Fərqli-valyuta transferində məbləğ `CurrencyFxService.getRate(mənbə, hədəf, tarix)` ilə ayrıca çevrilir.
4. **FX axtarışı:** eyni valyuta → `1`; əks halda düz istiqamət (`fx_rates`-də `base=X, quote=Y`) yoxlanılır, tapılmasa əks istiqamətin tərsi (`1/rate`) sınanılır; heç biri tapılmasa komanda **uğursuz olur** (404) — sükutla `1` fərz edilmir.
5. **Default kateqoriyalar** sistem-səviyyəli sətirlər kimi (`user_id = NULL`) `prisma/seed.ts` ilə yazılır (idempotent, `pnpm db:seed`), hər istifadəçiyə ayrıca kopyalanmır.
6. **`prisma/seed.ts` generasiya olunmuş Prisma client-i deyil, birbaşa `pg` paketini istifadə edir.** Səbəb: layihənin `nodenext` ESM+TS quraşdırılması `.js` uzantılı importları `.ts` mənbəyinə yalnız Nest-in öz compiler-i (`nest build`/`nest start`) və ya Vite (vitest) vasitəsilə həll edir; sadə `node --experimental-strip-types` ilə işə salınan müstəqil skript bunu edə bilmir. `pg` ilə yazmaq bu asılılığı tamamilə aradan qaldırır.
7. **`account_balances`-in `events`-dən tam reconciliation job-u qurulmayıb** — gələcək addım kimi qalır.

## Baxılan alternativlər

- **Balansı baza valyutaya çevrilmiş saxlamaq** — rədd edildi: hesabın "öz" balansı istifadəçi üçün ən intuitiv formadır (bank tətbiqi kimi), baza-valyuta agregasiyası Net Worth-un işidir.
- **FX tapılmayanda sükutla `1` qəbul etmək** — rədd edildi: səssiz səhv məlumat yaradardı (ADR-0004-in bütün məqsədinə zidd).
- **Kateqoriyaları hər istifadəçiyə qeydiyyatda kopyalamaq** — rədd edildi: lazımsız yazı və sinxronizasiya yükü; sistem sətirləri paylaşmaq daha sadədir.

## Nəticələr

- Gələcək Budget/Goals modulları eyni `CommandBus` + `events` nümunəsini təkrarlaya bilər (`aggregate_type` enum-unda `budget`/`goal` artıq var).
- `account_balances` reconciliation job-u və Categories-in iyerarxik UI-si/AI avtomatik-kateqoriyalaşdırması `docs/PROGRESS.md`-də açıq qalan addımlardır.
- Currency & FX-in gündəlik avtomatik yenilənməsi (xarici mənbədən cron) hələ qurulmayıb — kurslar əl ilə (`POST /fx-rates`) əlavə olunur.
