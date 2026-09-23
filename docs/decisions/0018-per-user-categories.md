# ADR-0018: Sistem kateqoriyalarının ləğvi, tam kateqoriya CRUD-u, ödəniş arxivləmə

Tarix: 2026-09-16
Status: accepted

## Kontekst

Manual testdə 4 problem aşkarlandı:

1. Kateqoriya silinmirdi — backend-də `DELETE` endpoint-i, hətta `CategoriesService`-də service metodu belə yox idi.
2. Sistem kateqoriyaları (`Category.userId = NULL`) konsepti istifadəçini məhdudlaşdırırdı — istifadəçi öz maliyyəsini idarə edən şəxsdir, ona "toxunulmaz" kateqoriya dayatmaq səhvdir; istifadəçi bunların redaktə/silinə bilməsini istədi.
3. Bank çıxarışı idxalının icmal ekranında lazım olan kateqoriya yoxdursa, səhifədən çıxıb `/categories`-ə getmək lazım idi.
4. Parent/child sxem səviyyəsində (`Category.parentId`) var idi, amma heç bir UI-də göstərilmirdi (tam flat siyahı).

İstifadəçi ilə aydınlaşdırılan qərarlar: sistem kateqoriyaları tamamilə aradan qalxsın (hər istifadəçi qeydiyyatda öz nümunə kateqoriyalarını alır, istədiyi kimi idarə edir); kateqoriya silinəndə əlaqəli ödənişlər üçün istifadəçi 4 strategiyadan birini seçə bilsin (başqa kateqoriyaya köçürmək, kateqoriyasız etmək, silmək, arxivləmək); iyerarxiya bir neçə səviyyəli ola bilər, UI göstərməlidir; idxal icmalında yeni kateqoriya ayrı modalda yaradılsın (bu ADR yalnız backend-i əhatə edir, frontend işi `financeos-web`-də ayrıca edilib).

## Qərar

### 1. Sistem kateqoriyalarının ləğvi

`Category.userId` sxem səviyyəsində nullable qalır (geriyə uyğunluq üçün sütunu dəyişməyə ehtiyac yoxdur), amma **yeni yaranan heç bir sətirdə artıq NULL olmur**. `IdentityService.register()` indi öz `$transaction`-ı daxilində, hər yeni istifadəçi üçün `DEFAULT_CATEGORIES` siyahısından (`src/modules/categories/default-categories.constants.ts`, köçürülüb `prisma/seed.ts`-dən) ona məxsus 10 kateqoriya, sonra `DEFAULT_CATEGORY_SUGGESTION_RULES`-dan (ad+növ ilə yeni kateqoriya id-lərinə map edilərək) ona məxsus ~20 təklif qaydası yaradır.

Bunun düz nəticəsi: `CategorySuggestionRule.userId` də artıq həmişə doludur — `docs/decisions/0017-category-rule-personalization.md`-dəki "qlobal + istifadəçi" ikili prioritet sistemi artıq lazımsızdır. `StatementImportService.preview()`-dəki qayda sorğusu `OR: [{userId: null}, {userId}]`-dən sadəcə `{userId}`-ə, sort isə iki-səviyyəli `userScore`-dan sadəcə "ən uzun keyword qalib"-ə sadələşdi. **Bu, ADR-0017-ni "qlobal qayda" hissəsində superseded edir** — fərdiləşdirmə mexanizmi (istifadəçi `saveRuleKeyword` ilə yeni qayda öyrədə bilməsi) özü dəyişmədi.

`CategoriesService.list()`/`getAccessibleCategory()` bənzər şəkildə sadələşdi: `userId === null` xüsusi halı çıxarıldı, sahiblik indi sərt bərabərlikdir (`category.userId !== userId` → 404).

**Köhnə datanın miqrasiyası**: birdəfəlik `scripts/migrate-categories-to-per-user.ts` mövcud hər istifadəçi üçün qlobal kateqoriyaların şəxsi kopyasını yaratdı (ad+növ üzrə, idempotent), varsa `ledger_entries`-i yeni kopyaya yönləndirdi, qlobal qaydaları da eyni şəkildə şəxsi kopyaya çevirdi, sonda qalan `user_id IS NULL` sətirləri sildi. Dev DB-də işlədildi (4 istifadəçi, 0 `ledger_entries` — real repointing lazım olmadı, yalnız klonlama).

### 2. Kateqoriya redaktə (`PATCH /categories/:id`)

`UpdateCategoryDto { name?, icon?, parentId? }`. **`kind` dəyişdirilə bilməz** — mövcud `ledger_entries`/`category_suggestion_rules`-un növ uyğunluğunu qorumaq üçün; səhv seçilmiş `kind`-i düzəltmək üçün yenisini yaradıb köhnəsini silmək lazımdır. `parentId` dəyişəndə mövcud kind-uyğunluq yoxlaması (`getAccessibleCategory`) tətbiq olunur, üstəlik yeni dövr (cycle) yoxlaması əlavə olundu — kateqoriya öz nəslindən birinin valideyni ola bilməz (`CategoriesService.assertNoCycle`, ata-baba zəncirini gəzir).

### 3. Kateqoriya silmə (`DELETE /categories/:id`) — 4 strategiya

`DeleteCategoryDto { strategy: 'reassign' | 'uncategorize' | 'delete' | 'archive', targetCategoryId? }`. Uşaq-kateqoriyası olan bir kateqoriya silinə bilməz (əvvəlcə uşaqları silin/köçürün — sadə, təhlükəsiz defolt, sükutla yenidən valideynləşdirmə yoxdur).

Bu, **yeni bir CQRS command** kimi tətbiq olundu (`src/modules/categories/commands/delete-category.{command,handler}.ts`), çünki `ledger_entries` `architecture.md`-dəki qorunan cədvəldir — birbaşa Prisma ilə kütləvi `UPDATE`/`DELETE` etmək qaydanı pozardı. Handler bir `$transaction` daxilində:

- **`reassign`**: `targetCategoryId` məcburidir (eyni `userId`+`kind`), əlaqəli `ledger_entries.category_id` ona köçürülür.
- **`uncategorize`**: `ledger_entries.category_id` → `NULL` (sxemdə artıq nullable idi).
- **`delete`**: əlaqəli `ledger_entries` sətirləri həqiqətən silinir.
- **`archive`**: yeni `ledger_entries.archivedAt` sütunu (bax aşağıda) `now()` təyin olunur, `categoryId` **əl ilə toxunulmur** — sonra kateqoriya silinəndə mövcud `ON DELETE SET NULL` FK-si onu avtomatik boşaldır.
- Strategiyadan asılı olmayaraq: kateqoriyaya aid `category_suggestion_rules` silinir (RESTRICT FK-nin qarşısını almaq üçün, ADR-0017-dəki eyni sıra qaydası), sonra kateqoriya özü silinir, bir `CategoryDeleted` event-i yazılır (`aggregateType: 'ledger'` — `AggregateType` enum-unda ayrıca `category` dəyəri yoxdur, əlavə etmək Postgres enum miqrasiyası tələb edərdi; məzmunca ən yaxın olan `ledger` seçildi, çünki bütün strategiyalar `ledger_entries`-ə toxunur).
- `delete`/`archive` strategiyalarında (balans dəyişən yeganə hallar — `reassign`/`uncategorize` yalnız `categoryId`-i dəyişir, məbləğ/istiqaməti yox) təsirlənən hər hesab üçün balans eyni `$transaction` daxilində `LedgerService.reconcile()`-in məntiqi təkrarlanaraq yenidən hesablanır (DI ilə `LedgerService`-i çağırmaq `CategoriesModule ↔ LedgerModule` dairəvi asılılığı yaradardı, ona görə kiçik (~15 sətir) balans-aqreqasiya məntiqi handler daxilində təkrarlandı).

### 4. Ödəniş arxivləmə (`ledger_entries.archivedAt`)

Yeni nullable `archivedAt DateTime?` sütunu. Bütün "cari" balans/hesabat sorğuları (`LedgerService.listEntries`/`reconcile`, `NetWorthService.balanceAsOf`/`getCategorySummary`, `BudgetService.sumEntries`) defolt `archivedAt: null` filtri əlavə etdi — `.claude/rules/module-dependencies.md`-dəki Ledger asılıları (Net Worth, Budget) tam yoxlanıldı. `LedgerController.listEntries`/`LedgerService.listEntries`-ə `AccountsService.list()`-dəki `includeArchived` adlandırma nümunəsi ilə eyni parametr əlavə olundu — arxivlənmiş sətirlər yalnız açıq istəklə görünür.

## Baxılan alternativlər

- **Sistem kateqoriyalarını saxlamaq, yalnız redaktə/silməyə icazə vermək (klon-on-edit)** — rədd edildi (istifadəçi seçimi): əlavə mürəkkəblik (klonlama məntiqi, orijinal-kopya əlaqəsi) faydasız idi, çünki istifadəçi hər halda "bu mənim kateqoriyamdır" gözləyir.
- **Kateqoriya silinəndə tək bir sabit davranış (məs. həmişə uncategorize)** — rədd edildi (istifadəçi seçimi): fərqli ssenarilər fərqli istəkdir (səhv yaradılmış kateqoriyanı silmək ≠ vaxtı keçmiş kateqoriyanı arxivləmək).
- **`ledger_entries`-i "delete" strategiyasında sadəcə arxivləmək, heç vaxt həqiqətən silməmək** — rədd edildi (istifadəçi seçimi): istifadəçi aydın "silmək" seçimini istədi, "arxivləmək" ayrıca seçim kimi mövcuddur.
- **`AggregateType` enum-una `category` əlavə etmək** — rədd edildi: Postgres `ALTER TYPE ... ADD VALUE`-nin tranzaksiya daxilində istifadə məhdudiyyətləri var, riski əsassızdır — `ledger` aggregateType kifayət qədər dəqiqdir.
- **Balans yenidən hesablamasını `LedgerService.reconcile()`-i DI ilə çağıraraq etmək** — rədd edildi: `CategoriesModule`-un `LedgerModule`-u import etməsi dairəvi asılılıq yaradardı (`LedgerModule` artıq `CategoriesModule`-u import edir). Kiçik təkrarlanma dairəvi asılılıqdan üstün tutuldu.

## Nəticələr

- Miqrasiyalar: `20260916120000_add_ledger_entry_archived_at` (`ledger_entries.archived_at`).
- `prisma/seed.ts` artıq heç nə etmir (kateqoriyalar qeydiyyatda yaradılır) — `prisma.seed` konfiqurasiyasını qıran alətlər üçün boş saxlanıldı.
- `docs/MODULES.md` §4 yeniləndi (sistem kateqoriyası konsepti çıxarıldı).
- Admin/idarəetmə endpoint-i (başqa istifadəçinin kateqoriyasını idarə etmək) hələ yoxdur — bu, artıq mövzusuzdur, çünki hər istifadəçi öz kateqoriyalarını tam idarə edə bilir; ADR-0016/0017-dəki bu maddə bağlandı.
