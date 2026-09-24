# ADR-0022: Bank idxalında köçürmə və geri qaytarma (refund)

Tarix: 2026-09-24
Status: accepted — tətbiq olunub (backend + web)

## Kontekst

Real Leobank faylı ilə işləyəndə idxal ekranındakı iki məhdudiyyət üzə çıxdı:

1. **Geri qaytarma.** Ödənilmiş xərc bəzən hesaba geri qayıdır (Bolt/AzParking/Temu qaytarmaları). Sətir `credit` olduğu üçün yalnız gəlir kateqoriyaları seçilə bilirdi, ledger da `recordIncome`-da gəlir kateqoriyası tələb edirdi. İstifadəçi qaytarmanı öz xərc kateqoriyasında (məs. `Nəqliyyat › Taksi`) müsbət kimi göstərə bilmirdi.
2. **Köçürmə.** Bank sətri yalnız gəlir və ya xərc kimi yazıla bilirdi. Öz hesabları arasında köçürmə (kart → yığım hesabı) iki ayrı gəlir/xərc kimi qeyd olunurdu, yəni gəlir və xərc statistikasını şişirdirdi. Mövcud "Daxili köçürmə" kateqoriyası yalnız bunu gizlədir, iki hesabı bağlamır.

Əlavə olaraq, `POST /statement-import/commit` ~1000 sətirlik çıxarış üçün `413 request entity too large` verirdi (Express-in default JSON limiti 100 KB, real sorğu ~300 KB).

## Qərar

### 1. Geri qaytarma = xərc kateqoriyası ilə credit

- `recordIncome` artıq **istifadəçinin istənilən kateqoriyasını** qəbul edir (gəlir və ya xərc). Xərc kateqoriyası ilə credit geri qaytarmadır. `recordExpense` dəyişmir (xərc kateqoriyası tələb edir).
- Ledger sxemi, event tipi və `ledger_entries` sütunları **dəyişmir**. Geri qaytarma sadəcə `direction='credit'` + xərc kateqoriyasıdır.
- **Təsir:**
  - `Net Worth › category-summary` artıq işarəli cəm hesablayır (credit +, debit −), yəni qaytarma xərci öz-özünə azaldır. Kod dəyişmədi, test əlavə olundu.
  - **Budget:** allocation-un `actual`-ı indi `debit − credit` (xalis xərc); ümumi gəlir (`totalIncome`) xərc kateqoriyalı credit-ləri **saymır** (qaytarma gəlir deyil).
- Web-də idxal cədvəlində credit qrupu üçün kateqoriya siyahısında ayrıca "Xərcin geri qaytarılması (xərc kateqoriyaları)" bölməsi var. Kateqoriya təklifi (qayda/AI) dəyişmədi, qaytarma seçimi əl ilədir.
- **Məlum məhdudiyyət:** əl ilə əlavə etmə formu (Ledger səhifəsi) hələ də credit üçün yalnız gəlir kateqoriyalarını göstərir. Backend artıq icazə verir, UI ayrıca dəyişdirilməlidir.

### 2. Köçürmə = mövcud `transferBetweenAccounts`

- `CommitRowDto.transferAccountId` (istəyə bağlı). Verilibsə sətir gəlir/xərc yox, iki hesab arasında **köçürmə** kimi yazılır:
  - `debit` → idxal hesabından `transferAccountId`-yə;
  - `credit` → `transferAccountId`-dən idxal hesabına.
- İdxal yeni yazma yolu açmır: `LedgerService.transfer` → mövcud `TransferBetweenAccountsCommand` (iki sətir, bir `transactionGroupId`, bir event).
- **Dublikat aşkarlanması:** komandaya istəyə bağlı `externalRefs` əlavə olundu; bank sətrinin fingerprint-i idxal hesabının sətrinə yazılır. Eyni fayl təkrar commit olunanda köçürmə də dublikat sayılır və yenidən yazılmır.
- **Yoxlamalar** (yarımçıq idxal olmasın deyə, heç nə yazılmazdan əvvəl): hesab istifadəçiyə məxsus və aktiv olmalı, idxal hesabından fərqli olmalı, **eyni valyutalı** olmalıdır; `transferAccountId` ilə `categoryId` birgə verilə bilməz.
- **Niyə eyni valyuta:** transfer məbləği mənbə hesabın valyutasındadır, hədəfə kurs ilə çevrilir. `credit` sətrində mənbə hesab başqa valyutadadırsa, bank çıxarışındakı məbləğ mənbə valyutasında məlum deyil. Valyutalar arası köçürmə əl ilə transfer ilə edilir.
- **Məlum məhdudiyyət (ikiqat sayılma):** hər iki hesabın çıxarışı idxal olunarsa, eyni köçürmə iki dəfə yazıla bilər (bir dəfə köçürmə kimi, bir dəfə qarşı hesabın çıxarışında sadə gəlir/xərc kimi). Preview bunu hələ aşkar etmir. İstifadəçi qarşı hesabın həmin sətrini seçimdən çıxarmalıdır. Növbəti mərhələdə preview-də "bu məbləğ və tarixdə köçürmə artıq var" xəbərdarlığı əlavə edilə bilər.
- **Web:** hər qrup üçün "Xərc/Gəlir | Köçürmə (hesablar arası)" seçimi. Köçürmə seçiləndə kateqoriya əvəzinə hesab seçilir; hesab seçilməyibsə göndərmə bloklanır.

### 3. Sorğu ölçüsü limiti (413)

- JSON/urlencoded limiti **5 MB**-a qaldırıldı (`src/app.setup.ts`, `configureBodyParsers`, `main.ts`-də və e2e-də eyni funksiya işlədilir).
- `rows` massivi ən çox **5000** element (`ArrayMaxSize`).

### 4. "Gələcək üçün xatırla" default

İstifadəçi qərarı: bütün qruplarda default seçilidir (əvvəl yalnız təklifsiz qruplarda idi). Qayda/daxili köçürmə təklifli qruplarda seçim göstərilmir (artıq qayda var). Nəticə: qəbul edilən AI təklifi növbəti idxalda pulsuz qayda kimi işləyir. Risk: səhv AI təklifini görmədən qəbul edən istifadəçi səhv qaydanı da saxlayır. Qaydanı kateqoriya səhifəsindən silmək/dəyişmək olar.

## Nəticələr

- Testlər: ledger (geri qaytarma + `category-summary` xalis), budget (`actual` xalis, `totalIncome` qaytarmasız), statement-import (köçürmə commit, iki tərəfli sətir, idempotentlik, yoxlamalar, refund commit, >100 KB gövdə).
- `docs/MODULES.md` (Ledger, Statement Import), web `docs/PAGES.md` yenilənib.
- Açıq: preview-də köçürmənin qarşı hesabla ikiqat sayılma xəbərdarlığı; Ledger səhifəsi əl ilə formasında geri qaytarma kateqoriyası; valyutalar arası köçürmə idxalı.
