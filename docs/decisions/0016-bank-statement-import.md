# ADR-0016: Bank çıxarışı idxalı (Phase 1 — Leobank CSV)

Tarix: 2026-09-15
Status: accepted

## Kontekst

`docs/decisions/0003-mvp-scope.md` bank/fintech inteqrasiyalarını (Plaid/Salt Edge/Wise/Payoneer canlı sync) bilərəkdən MVP-dən kənarda saxlamışdı. Fayl-əsaslı (CSV/XLS) çıxarış idxalı isə fərqli, daha kiçik bir problemdir — canlı API əlaqəsi tələb etmir — və istifadəçi real Leobank CSV nümunəsi təqdim edərək bunun indi tətbiq olunmasını istədi.

İstifadəçi ilə razılaşdırılan scope: yalnız CSV (XLS sonraya), backend-də parsing+kateqoriyalaşdırma (`financeos-core`), ilk bank profili Leobank, daxili "Xəzinə/Savings" hərəkətləri üçün xüsusi kateqoriya (yeni hesab modelləşdirilmir), kateqoriya təklifi sadə açar-söz qaydası (data kimi DB-də, kodda hardcode olunmur).

## Qərar

1. **Yeni modul: `src/modules/statement-import/`** (`Asılıdır: Accounts, Categories, Ledger`, bax `.claude/rules/module-dependencies.md`). İki endpoint:
   - `POST /statement-import/preview` — faylı parse edir, kateqoriya təklif edir, dublikatları aşkarlayır, balans-zənciri yoxlaması aparır. **Heç nə yazmır.**
   - `POST /statement-import/commit` — istifadəçinin təsdiqlədiyi sətirləri mövcud `LedgerService.recordIncome`/`recordExpense` command-larına göndərir. Import modulunun özü `ledger_entries`-ə birbaşa yazmır — bu, `architecture.md`-nin "hər yazı command vasitəsilə" qaydasını qoruyur.

2. **Bank profili abstraksiyası** (`bank-profiles/bank-profile.interface.ts`): `parse(buffer): ParsedStatementRow[]`. Hər bank üçün ayrı fayl (`leobank.profile.ts`), registry-də (`bank-profile.registry.ts`) qeydiyyatdan keçir. Yeni bank = yeni profil faylı, mövcud koda toxunmadan.

3. **Leobank formatı**: `Tarix,Təyinat,Məbləğ,Komissiya,Balans` CSV, `csv-parse` kitabxanası ilə (quote-aware, `Təyinat`-dakı çoxsətirli mətni düzgün oxuyur). Tarix `DD-MM-YYYY HH:mm:ss` — timezone fərz edilmir (sistemin digər `occurredAt` sahələri kimi). `Məbləğ`-in işarəsi istiqaməti (debit/credit) verir.

4. **Daxili köçürmələr**: Leobank-ın "Xəzinə/Savings" cib xüsusiyyətinin yaratdığı sətirlər (`Xəzinəyə köçürmə`, `Artım «...»`, `Balans tamamlanması «...»`, `«...» Xəzinəsindən vəsaitin çıxarılması`) formata spesifik naxış siyahısı ilə (`leobank.profile.ts`-in özündə, generic qayda cədvəlində yox) aşkarlanır və iki yeni sistem kateqoriyasından (`"Daxili köçürmə"`, biri `kind=expense`, biri `kind=income` — istiqamətə uyğun) birinə avtomatik yönləndirilir. Real Leobank datası ilə (62 sətir) sınandı — həm adi əməliyyatlar, həm bu naxışlar düzgün ayrıldı.

5. **Kateqoriya təklifi**: yeni `category_suggestion_rules` cədvəli (`keyword`, `categoryId`), `prisma/seed.ts`-də ilkin doldurulub — yalnız birmənalı, aydın tanınan adlar (Uber/Bolt/Wolt/Bravo/Araz Supermarket/Socar Petrol/TP METRO/Azərişıq və s.). Uyğunlaşdırma: case-insensitive substring, uzun açar sözlər üstünlük alır (`Bolt Food` → Yemək, sadə `Bolt` → Nəqliyyat). Uyğun gəlməyən sətirlər (kart-maskalı köçürmələr, şəxs adları, POS kodları) kateqoriyasız qalır — istifadəçi review ekranında təyin edir.

6. **Dublikat qorunması**: `Ledger`-ə əlavə olunan `externalRef` idempotency açarı (bax `docs/decisions/0015-ledger-idempotent-writes.md`) ilə. Fingerprint = `sha256(accountId|occurredAtISO|direction|amount|təmizlənmiş təsvir)`, `preview`-də hesablanıb qaytarılır, `commit`-də dəyişdirilmədən geri göndərilir (server yenidən hesablamır — istifadəçinin redaktə edə biləcəyi `note` sahəsindən asılı olmasın deyə).

7. **Balans-zənciri yoxlaması**: hər sətir üçün "əvvəlki sətirin Balans-ı + bu sətirin Məbləğ-i − Komissiya = bu sətirin Balans-ı" yoxlanır (0.01 tolerantlıqla), uyğunsuzluq `balanceMismatch` bayrağı kimi qaytarılır (parse xətalarını erkən aşkarlamaq üçün, DB-yə yazmır). Real 62 sətirlik Leobank çıxarışında sıfır uyğunsuzluq tapıldı.

## Baxılan alternativlər

- **XLS-i də v1-də dəstəkləmək** — rədd edildi: real nümunə yalnız CSV idi, XLS parse etmək fərqli kitabxana (`xlsx`/`exceljs`) və yoxlanılmamış sütun uyğunlaşdırması tələb edir. `BankProfile.parse(buffer)` interfeysi formatdan asılı deyil, XLS dəstəyi sonradan mövcud profillərə toxunmadan əlavə oluna bilər.
- **Frontend-də parsing** — rədd edildi (istifadəçi seçimi): backend-də mərkəzləşdirmək bank profillərini bütün client-lər (mobil daxil) üçün bir yerdə saxlayır.
- **Leobank-ın "Savings" cibini ayrıca `Account` kimi modelləşdirmək** — rədd edildi (istifadəçi seçimi): istifadəçi əvvəlcədən ikinci hesab açmalı olardı, MVP üçün artıq mürəkkəblik. Kateqoriya-əsaslı yanaşma sadədir, hesabatlardan asanlıqla filtrlənə bilər.
- **Kateqoriya qaydalarını kodda hardcode etmək** — rədd edildi (istifadəçi seçimi): DB cədvəli kimi saxlanılıb, gələcəkdə admin endpoint-i ilə redaktə oluna bilər, redeploy tələb etmir.

## Nəticələr

- Yeni asılılıq: `csv-parse` (backend). `@types/multer` dev-dependency, `tsconfig.json`-un `types` massivinə `"multer"` əlavə olundu (`Express.Multer.File` tipi üçün).
- `Ledger` modulunun `LedgerModule`-u indi `LedgerService`-i export edir (əvvəllər etmirdi) ki, `StatementImportModule` ondan istifadə edə bilsin.
- Bu, yalnız **backend**-dir (Phase 1). Frontend-də (`financeos-web`) fayl yükləmə/review UI-si ayrıca plan kimi ediləcək.
- Kateqoriya təklif qaydaları hazırda yalnız seed-lə əlavə olunur, admin/idarəetmə endpoint-i yoxdur — lazım olsa gələcək addım.
