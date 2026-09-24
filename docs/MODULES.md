# Modullar — Funksionallıq və DB Sxemi

Bu sənəd hər modulun nə etdiyini, hansı cədvəllərə sahib olduğunu və başqa hansı modullardan asılı olduğunu təsvir edir. Asılılıq qaydaları üçün `.claude/rules/module-dependencies.md`-ə bax.

Əsas prinsip: heç bir modul başqasının cədvəlinə birbaşa yazmır, hamısı `.claude/rules/architecture.md`-dəki Command → Event → Projection qaydasına tabedir.

---

## 1. Identity & Access

**Asılıdır:** — · **Ondan asılıdır:** bütün modullar

**Funksiyalar:**
- İstifadəçi qeydiyyatı/login
- Parol sıfırlama (`POST /auth/forgot-password`, `POST /auth/reset-password`) — email-lə (Resend, `src/modules/email/`), bax `docs/decisions/0019-email-infrastructure.md`
- Session/token idarəetməsi
- Client qeydiyyatı (mobile, web, ai_chat, api, mcp) və hər birinin scope-u
- Hər command üçün permission yoxlaması
- Hesab deaktivasiyası, məlumatların silinməsi

**Cədvəllər:**
```sql
users (
  id uuid PK,
  email text UNIQUE,
  password_hash text,
  base_currency char(3),
  locale text,
  created_at timestamptz
)

clients (
  id uuid PK,
  user_id uuid FK -> users,
  type enum('mobile','web','ai_chat','api','mcp'),
  name text,
  scopes jsonb,
  created_at timestamptz,
  revoked_at timestamptz NULL
)

sessions (
  id uuid PK,
  client_id uuid FK -> clients,
  token_hash text,
  expires_at timestamptz
)

password_reset_tokens (   -- bax docs/decisions/0019-email-infrastructure.md
  id uuid PK,
  user_id uuid FK -> users ON DELETE CASCADE,
  token_hash text,
  expires_at timestamptz,
  used_at timestamptz NULL,   -- dolu = artıq istifadə olunub (bir-dəfəlik)
  created_at timestamptz
)
```

---

## 2. Accounts

**Asılıdır:** Identity · **Ondan asılıdır:** Ledger, Net Worth, Goals

**Funksiyalar:**
- Hesab yaratma/arxivləmə: nağd, bank, kart, yığım, kredit, gələcəkdə investisiya
- Hesab metadata: valyuta, tip, qrup (fərdi/freelance-biznes)
- Balans sorğusu (`account_balances` cache-dən və ya `ledger_entries`-dən agregasiya)

**Cədvəllər:**
```sql
accounts (
  id uuid PK,
  user_id uuid FK -> users,
  name text,
  type enum('cash','bank','card','savings','loan','e_wallet','investment'),
  currency char(3),
  account_group enum('personal','freelance_business') NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz
)
```

---

## 3. Ledger (əsas mühərrik)

**Asılıdır:** Accounts, Categories, Currency & FX · **Ondan asılıdır:** Net Worth, Budget, Goals, Audit, Statement Import

**Funksiyalar:**
- Command-ları qəbul edir: `recordIncome`, `recordExpense`, `transferBetweenAccounts`, `adjustBalance`
- `recordIncome` istifadəçinin istənilən kateqoriyasını qəbul edir; **xərc kateqoriyası ilə credit = geri qaytarma (refund)** və həmin kateqoriyanın xərcini azaldır (`docs/decisions/0022-import-transfers-and-refunds.md`). Budget `actual`-ı xalis xərcdir, qaytarma gəlir sayılmır
- Hər command üçün dəyişməz **event** yaradır
- Event-dən double-entry sətirlərini (`ledger_entries`) generasiya edir
- Balans hesablayır (agregasiya/cache)
- Tarixi bərpa (replay) imkanı verir

**Cədvəllər:**
```sql
events (
  id uuid PK,
  sequence bigserial,
  user_id uuid FK -> users,
  client_id uuid FK -> clients,
  aggregate_type enum('account','ledger','budget','goal'),
  aggregate_id uuid,
  event_type text,        -- 'ExpenseRecorded','TransferExecuted', ...
  payload jsonb,
  created_at timestamptz
)

ledger_entries (
  id uuid PK,
  event_id uuid FK -> events,
  transaction_group_id uuid,   -- transfer-in iki tərəfini bağlayır
  account_id uuid FK -> accounts,
  category_id uuid FK -> categories NULL,
  amount numeric,
  direction enum('debit','credit'),
  currency char(3),
  fx_rate_to_base numeric,     -- yaradıldığı andakı kurs, dəyişməz
  occurred_at timestamptz,
  note text,
  external_ref text NULL,      -- idempotency açarı, bax docs/decisions/0015-ledger-idempotent-writes.md
  archived_at timestamptz NULL -- dolu = "arxivlənib" (kateqoriya silinəndə strategy=archive), balans/hesabatlardan çıxarılır, bax docs/decisions/0018-per-user-categories.md
)

account_balances (
  account_id uuid PK FK -> accounts,
  balance numeric,
  updated_at timestamptz
)
```

---

## 4. Categories

**Asılıdır:** — · **Ondan asılıdır:** Ledger, Budget, Net Worth, Statement Import

**Funksiyalar:**
- Kateqoriya CRUD (yaratma/redaktə/silmə), iyerarxik (parent/child) — sistem/qlobal kateqoriya konsepti yoxdur, hər kateqoriya bir istifadəçiyə aiddir (bax `docs/decisions/0018-per-user-categories.md`)
- Yeni istifadəçi qeydiyyatdan keçəndə ona məxsus nümunə kateqoriya seti + təklif qaydaları avtomatik klonlanır (`IdentityService.register()`, `src/modules/categories/default-categories.constants.ts`)
- Silmə 4 strategiya dəstəkləyir (əlaqəli ödənişlər üçün): `reassign` (başqa kateqoriyaya köçür), `uncategorize` (kateqoriyasız et), `delete` (ödənişləri sil), `archive` (`ledger_entries.archived_at` ilə gizlət) — `DeleteCategoryCommand`/`Handler`, bir `CategoryDeleted` event-i yazır
- Kateqoriya üzrə agregasiya (Reporting üçün)
- AI kateqoriya təklifi bank idxalında işləyir (Jev, yalnız istifadəçinin öz kateqoriyalarından seçir; bax §10 və `docs/decisions/0021-jev-ai-suggestions.md`). Qəbul/rədd mexanizmi: təklif idxal icmalında istifadəçi təsdiqinə qədər sadəcə təklifdir; "Gələcək üçün xatırla" qəbul edilmiş təklifi daimi `category_suggestion_rules` qaydasına çevirir
- Açar söz uyğunlaşdırma məntiqi ortaq saf funksiyadadır: `src/modules/categories/category-rule-matcher.ts` (idxal və assistant istifadə edir), kateqoriyanın tam yol adı `category-path.ts`-dədir

**Cədvəllər:**
```sql
categories (
  id uuid PK,
  user_id uuid FK -> users,        -- həmişə dolu (yeni datada) — sistem/qlobal kateqoriya yoxdur
  parent_id uuid FK -> categories NULL,
  name text,
  kind enum('income','expense'),   -- yaradıldıqdan sonra dəyişdirilə bilməz
  icon text
)

category_suggestion_rules (      -- bax docs/decisions/0016-bank-statement-import.md, 0017/0018
  id uuid PK,
  user_id uuid FK -> users,       -- həmişə dolu — hər istifadəçi öz qaydalarını görür
  keyword text,
  category_id uuid FK -> categories,
  created_at timestamptz
)
```

---

## 5. Currency & FX

**Asılıdır:** — · **Ondan asılıdır:** Ledger, Net Worth

**Funksiyalar:**
- Gündəlik kurs yeniləmə — `FxSyncService` (frankfurter.dev v2-dən, açarsız), hər gün `@Cron` + server açılışında `onModuleInit`, əl ilə tetiklənmə üçün `POST /fx-rates/sync`. Yalnız hazırda istifadədə olan valyutalar (`accounts.currency` ∪ `users.base_currency` ∪ `goals.target_currency`) sinxronlaşdırılır, bax `docs/decisions/0020-fx-daily-sync.md`
- Əl ilə kurs daxiletmə: `POST /fx-rates`
- Tarixi kursların saxlanması
- Konversiya funksiyası (A→B, tarixə görə) — `CurrencyFxService.getRate()`, düz kurs tapılmasa tərs kursun tərsi
- İstifadəçinin əsas valyutasının idarəsi

**Cədvəllər:**
```sql
fx_rates (
  base_currency char(3),
  quote_currency char(3),
  rate numeric,
  rate_date date,
  source text,  -- 'manual' (əl ilə) və ya 'frankfurter' (avtomatik sync)
  PRIMARY KEY (base_currency, quote_currency, rate_date)
)
```

---

## 6. Net Worth & Reporting

**Asılıdır:** Ledger, Currency & FX · **Ondan asılıdır:** — (leaf, yalnız oxuyur)

**Funksiyalar:**
- Net worth zaman xətti (bütün hesabların əsas valyutaya çevrilmiş cəmi)
- Kateqoriya üzrə xərc/gəlir hesabatı, dövr üzrə
- Trend qrafikləri üçün agregasiya sorğuları

Öz cədvəli yoxdur — `ledger_entries` + `fx_rates` üzərində view/materialized view.

---

## 7. Budget & Rules

**Asılıdır:** Categories, Ledger (oxuma) · **Ondan asılıdır:** —

**Funksiyalar:**
- Şablon CRUD (MVP: 2-3 hardcoded — 50/30/20 və s.)
- Qaydanı JSON formatda saxlamaq (gələcək builder da eyni formatı yazacaq)
- Faktiki xərcin qaydaya uyğunluğunu yoxlamaq, limit aşımını aşkarlamaq
- İstifadəçinin özünün prioritetləşdirdiyi qaydalar sırası

**Cədvəllər:**
```sql
budgets (
  id uuid PK,
  user_id uuid FK -> users,
  name text,
  source enum('template','custom'),
  definition jsonb,     -- {"allocations":[{"category_id":"...","percent":20}, ...]}
  priority int,
  active_from date,
  active_to date NULL
)
```

---

## 8. Goals

**Asılıdır:** Accounts, Ledger (oxuma) · **Ondan asılıdır:** —

**Funksiyalar:**
- Hədəf CRUD: ad, məbləğ, tarix, bağlı hesab
- Tərəqqinin ledger-dən hesablanması
- Gələcək: xatırlatma/bildiriş trigger-ləri

**Cədvəllər:**
```sql
goals (
  id uuid PK,
  user_id uuid FK -> users,
  name text,
  target_amount numeric,
  target_currency char(3),
  target_date date NULL,
  linked_account_id uuid FK -> accounts NULL,
  status enum('active','completed','abandoned'),
  created_at timestamptz
)
```

---

## 9. AI Assistant (Command Client)

**Asılıdır:** Accounts, Categories (oxuma), Jev, Claude (ehtiyat); yazma command-larına özü toxunmur · **Ondan asılıdır:** — (sadəcə bir client)

**Hazırda tətbiq olunan — "sürətli əlavə" (`src/modules/assistant/`):**
- `POST /assistant/parse-transaction` `{ text }` → gəlir/xərc **təklifi** qaytarır (istiqamət, məbləğ, valyuta, hesab, kateqoriya, `dayOffset`, qeyd, sahə üzrə confidence, `source`, `warnings`). **Heç nə yazmır** — yazma istifadəçi təsdiqindən sonra client-in mövcud `recordIncome`/`recordExpense` çağırışı ilə olur (`events.client_id` həmin client-dir)
- Kaskad: deterministik parser (`transaction-text.parser.ts`: məbləğ/valyuta/gün/qeyd, LLM-siz) → açar söz qaydası → mətndə hesab adı / tək hesab → **Jev** (istiqamət, hesab, kateqoriya `Choice` sualları) → **Claude Haiku 4.5** ehtiyatı (parser məbləğ tapmayanda, bir neçə məbləğ olanda, Jev uğursuz olanda, istiqamət və ya hesab qeyri-müəyyən qalanda; nəticəsi parser/Jev-i əvəz edir, onlarla qarışdırılmır)
- Hər provayder best-effort-dur: açar yoxdursa və ya xəta olarsa AI addımı ötürülür. Bax `docs/decisions/0021-jev-ai-suggestions.md`

**Hələ tətbiq olunmayıb (gələcək):**
- Səs girişi, çox addımlı dialoq (aydınlaşdırıcı suallar), tam chat interfeysi
- Sadə büdcə/limit təklifləri generasiyası

Ayrıca modul deyil — konseptual olaraq bir client-dir (`clients.type='ai_chat'` gələcək müstəqil chat client-i üçün saxlanılır), amma "sürətli əlavə" web client-in bir xüsusiyyətidir: təsdiq web-də olur, ona görə hadisələr `web` client-i ilə yazılır. Öz cədvəli yoxdur.

---

## 10. Statement Import (bank çıxarışı idxalı)

**Asılıdır:** Accounts, Categories, Ledger (`recordIncome`/`recordExpense` command-ları vasitəsilə yazır) · **Ondan asılıdır:** —

**Funksiyalar:**
- Bank çıxarışı faylını (hazırda CSV, bank-spesifik "profil" ilə) parse edir
- İdxaldan əvvəl önizləmə: istiqamət, kateqoriya təklifi, dublikat/balans-uyğunsuzluq bayraqları — DB-yə yazmır
- Təsdiqlənmiş sətirləri mövcud Ledger command-larına göndərir (`externalRef` ilə idempotent). Sətir `transferAccountId` ilə **köçürmə** kimi də yazıla bilər (`transferBetweenAccounts`, eyni valyutalı iki hesab; bank sətrinin fingerprint-i idxal hesabının sətrinə yazılır); credit sətrinə xərc kateqoriyası seçmək = geri qaytarma. `commit` sorğu gövdəsi limiti 5 MB, ən çox 5000 sətir (ADR-0022)
- Bankın daxili cib/xəzinə hərəkətlərini (real gəlir/xərc olmayan) xüsusi kateqoriyaya yönləndirir
- İstifadəçinin commit zamanı seçdiyi kateqoriyanı (istəyə görə) istifadəçiyə məxsus yeni `category_suggestion_rules` sətri kimi yadda saxlayır — gələcək idxallarda avtomatik təklif olunsun deyə
- Kateqoriya təklifi kaskadı: daxili köçürmə → istifadəçinin açar söz qaydası → **AI (Jev)** — yalnız qayda tapılmayan və dublikat olmayan sətirlər üçün, `(istiqamət, təsvir)` üzrə qruplaşdırılmış 6-lıq batch-larla bir Jev sorğusunda (ən çox 150 qrup, sətir sayı çox olanlar əvvəl, paralellik 3, retry + ümumi vaxt büdcəsi; bax ADR-0021 pilot bölməsi). Jev yalnız istifadəçinin öz kateqoriyalarından və açıq "heç biri uyğun deyil" variantından seçir, yeni kateqoriya yaratmır. Preview cavabında `suggestionSource` (`rule`/`internal_transfer`/`ai`) və `suggestionConfidence` var

Öz cədvəli yoxdur (Ledger-in `external_ref`-i və Categories-in `category_suggestion_rules`-u istifadə edir, oxuyur və yazır). Bax `docs/decisions/0016-bank-statement-import.md`, `docs/decisions/0017-category-rule-personalization.md`.

---

## MVP-də "skeleton" saxlanan modullar

- **Debt/Credit** → `accounts.type='loan'` kimi indi dəstəklənir, ayrıca modul v2-də
- **Integration Gateway** (canlı bank/fintech API sync — Plaid/Salt Edge, MCP) → command layer hazır olduğu üçün bunlar sonra `clients` cədvəlinə yeni tip kimi qoşulur. **Fayl-əsaslı (CSV) çıxarış idxalı bunun bir hissəsi kimi artıq tətbiq olunub** — bax §10 Statement Import, `docs/decisions/0016-bank-statement-import.md`.

Ətraflı: `docs/decisions/0003-mvp-scope.md`
