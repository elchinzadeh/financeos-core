# ADR-0017: İstifadəçiyə məxsus kateqoriya təklif qaydaları

Tarix: 2026-09-16
Status: accepted

## Kontekst

Bank çıxarışı idxalının icmal ekranında (bax `docs/decisions/0016-bank-statement-import.md`) yüzlərlə sətir ola bilər. `category_suggestion_rules` (indiyədək yalnız qlobal, seed-lə doldurulan) hər sətirin kateqoriyasını əl ilə seçmə yükünü tam aradan qaldırmır — istifadəçinin özünün tanıdığı, sistemdə olmayan tacir adları hər idxalda yenidən əl ilə seçilməli olurdu. Frontend tərəfdə eyni təsvirli sətirlər qruplaşdırılıb kateqoriya bir dəfə seçilə bilər (`financeos-web`-in dəyişikliyi), amma bu seçimin **gələcək idxallarda** yadda qalması üçün backend-də istifadəçiyə məxsus qaydalar lazımdır.

## Qərar

1. `CategorySuggestionRule`-a `userId String? @map("user_id")` əlavə olundu — `Category.userId`-lə eyni konvensiya: `NULL` = qlobal/sistem qaydası (seed-dəki mövcud sətirlər dəyişmədən qalır), dolu qiymət = yalnız həmin istifadəçiyə aid.

2. `StatementImportService.preview()`-dəki qayda sorğusu `where: { OR: [{ userId: null }, { userId }] }` ilə məhdudlaşdırılır — istifadəçi yalnız öz qaydalarını və qlobal qaydaları görür, başqa istifadəçilərin qaydalarını yox. Uyğunlaşdırma sıralaması iki səviyyəli oldu: əvvəlcə istifadəçiyə məxsus qayda (varsa) qlobal qaydadan üstün tutulur, sonra (əvvəlki kimi) uzun `keyword` üstünlük alır — istifadəçinin özəl düzəlişi sistem defoltunu üstələyir.

3. `CommitRowDto`-ya istəyə görə `saveRuleKeyword?: string` əlavə olundu. `commit()`-də, daxil edilən (`include=true`) və kateqoriyası olan hər sətir üçün bu sahə verilibsə, `(userId, keyword)` cütü case-insensitive yoxlanılır — mövcud deyilsə yeni `CategorySuggestionRule` yaradılır. Frontend bunu qrup üzrə (hər unikal təsvirdən bir dəfə) göndərir, sətir başına yox.

4. Yazı birbaşa `this.prisma.categorySuggestionRule` ilə edilir, `CategoriesService`-ə dolayı çağırış əlavə edilmədi — `StatementImportService` artıq `preview()`-də eyni cədvəli birbaşa oxuyur, yeni bir dolayı qat bu simmetriyanı pozardı. Bu, `architecture.md`-dəki "hər yazı command vasitəsilə" qaydasını pozmur, çünki `category_suggestion_rules` qorunan (event-sourced) cədvəllər siyahısında (`accounts`, `ledger_entries`, `budgets`, `goals`) deyil — `categories.service.ts`-in özü də bu cədvələ birbaşa Prisma ilə yazır.

## Baxılan alternativlər

- **Yazını `CategoriesService`-ə köçürmək** — rədd edildi: `StatementImportService` artıq eyni cədvəli birbaşa oxuyur, əlavə dolayılıq faydasız mürəkkəblikdir bu miqyasda.
- **Qaydanı hesaba (`accountId`) bağlamaq** — rədd edildi: istifadəçinin tanıdığı tacir adı bütün hesablarında/banklarında eynidir, `userId`-ə bağlamaq daha faydalıdır (bir hesabda öyrənilən, digərində də işləyir).
- **Hər sətir üçün ayrıca `saveRuleKeyword` göndərmək (qrup başına bir yox)** — rədd edildi (frontend qərarı): eyni `(userId, keyword)` üçün təkrar sorğu lazımsızdır, `saveLearnedRule` idempotent olsa da qrupun yalnız ilk sətrindən göndərilir.

## Nəticələr

- Miqrasiya: `category_suggestion_rules.user_id` (nullable UUID, FK → `users`, `ON DELETE SET NULL` — `categories.user_id`-lə eyni FK siyasəti).
- `docs/MODULES.md` §4-dəki `category_suggestion_rules` sxem blokuna `user_id` əlavə olundu.
- **Vacib düzəliş:** `IdentityService.deleteAllData()` (GDPR silinmə) və test-in `cleanupTestUser()`-i `categorySuggestionRule.deleteMany({ userId })`-i istifadəçinin öz `category`-lərini silməzdən **əvvəl** çağıracaq şəkildə yeniləndi. Səbəb: `user_id` FK-si `SET NULL`-dur (categories ilə eyni), yəni bu addım olmadan istifadəçi silinəndə onun öyrədilmiş şəxsi qaydaları silinmək əvəzinə `user_id=NULL` olub **bütün istifadəçilər üçün qlobal qaydaya çevrilirdi** — məhz bu funksionallığın qarşısını almaq istədiyimiz məxfilik sızması. Əl ilə smoke test zamanı aşkarlandı (silinmiş istifadəçinin qaydası yeni istifadəçiyə təklif kimi göründü) və düzəldildi, GDPR axını ilə yenidən təsdiqləndi.
- Admin/idarəetmə endpoint-i (qaydaları əl ilə redaktə/silmə) hələ yoxdur — `docs/decisions/0016-bank-statement-import.md`-dəki eyni açıq maddə qalır.
