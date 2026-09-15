# ADR-0015: Ledger command-larına idempotency açarı (`externalRef`)

Tarix: 2026-09-15
Status: accepted

## Kontekst

Bank çıxarışı idxalı (bax `docs/decisions/0016-bank-statement-import.md`) faylları təkrar yükləyəndə (məs. üst-üstə düşən tarix aralığı ilə) eyni əməliyyatların ikinci dəfə `ledger_entries`-ə yazılmasının qarşısı alınmalıdır. Bu problem yalnız bank idxalına aid deyil — istənilən client eyni command-ı şəbəkə xətası səbəbindən təkrar göndərəndə (retry) də eyni ehtiyac yaranır.

## Qərar

`RecordIncomeDto`/`RecordExpenseDto`-ya istəyə görə `externalRef?: string` sahəsi əlavə olundu. `RecordIncomeHandler`/`RecordExpenseHandler` yazmazdan əvvəl `(accountId, externalRef)` cütünə görə mövcud sətir axtarır — varsa, yeni event/sətir yaratmadan mövcud sətri qaytarır (idempotent); yoxdursa normal davam edir.

Sxem: `ledger_entries.external_ref` (nullable `TEXT`), `@@unique([accountId, externalRef])`. Postgres NULL-ları unikallıq yoxlamasında bir-birindən fərqli sayır, ona görə bu, `externalRef` göndərməyən mövcud client-lərə (mobile, web-in adi formaları) heç bir təsir etmir — yalnız `externalRef` göndərən sorğular arasında dedup işləyir.

`TransferBetweenAccounts`/`AdjustBalance` command-larına **hələ əlavə olunmayıb** — bank idxalı yalnız gəlir/xərc sətirləri yaradır, transfer/düzəliş idxal axınına daxil deyil. Lazım olsa, eyni pattern həmin command-lara da əlavə oluna bilər.

## Baxılan alternativlər

- **Dedup-u yalnız import modulunun özündə (Ledger-ə toxunmadan) etmək** — rədd edildi: bu, import modulunun `ledger_entries`-i birbaşa sorğulayıb "yazılıbmı" qərarını Ledger-in nəzarətindən kənarda verməsi deməkdir; `architecture.md`-nin "hər yazı command vasitəsilə" prinsipi ilə daha uzlaşan yol — yoxlamanı da command-ın öz handler-inə qoymaqdır (tək həqiqət mənbəyi).
- **Ayrıca `idempotency_keys` cədvəli** (Stripe-vari) — rədd edildi: hazırkı miqyas üçün artıq mürəkkəblikdir, `ledger_entries` üzərində birbaşa unikal indeks kifayət edir.

## Nəticələr

- `externalRef` göndərən istənilən client (təkcə bank idxalı deyil) indi təhlükəsiz retry edə bilər.
- `LedgerEntryResponseDto`-da `externalRef` göstərilmir (daxili sahədir), amma cavab body-də (mövcud `eventId` kimi) görünə bilər — bu, hazırkı controller-lərin DTO-nu tətbiq etmədən raw Prisma obyektini qaytarması ilə əlaqəli mövcud davranışdır, bu ADR-in əhatəsindən kənardır.
