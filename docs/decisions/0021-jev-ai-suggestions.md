# ADR-0021: AI kateqoriya təklifi və "sürətli əlavə" — Jev + Claude ehtiyatı

Tarix: 2026-09-24
Status: accepted — tətbiq olunub (backend + web); ilkin canlı pilot 2026-09-24 keçirilib (aşağıda "Canlı pilot nəticələri"); real Leobank faylı ilə də sınanıb ("Real Leobank faylı ilə pilot"): provayder qeyri-sabit idi, batch + sərt vaxt həddi əlavə edildi

## Kontekst

`docs/PROGRESS.md`-də iki açıq maddə var:

- "Categories: AI avtomatik-kateqoriyalaşdırma təklifi".
- "AI Assistant client-i tətbiq et".

Bank idxalında kateqoriya təklifi hazırda yalnız istifadəçinin açar söz qaydalarına əsaslanır. Qayda tacir təsvirində substring kimi axtarılır, ən uzun uyğunluq seçilir ([statement-import.service.ts](../../src/modules/statement-import/statement-import.service.ts), `preview()`). Uyğunluq tapılmasa `suggestedCategoryId = null` olur. Yeni istifadəçidə qayda azdır, ona görə sətirlərin çoxu boş gəlir.

AI Assistant (MODULES.md §9) hələ başlanmayıb. `ClientType` enum-da `ai_chat` var, amma istifadə olunmur.

Provayder kimi TypeSafe AI-ın **Jev** modeli araşdırıldı (15 sentyabr 2026-da buraxılıb, erkən giriş). Jev LLM deyil, mətn yaratmır. `state` + tipli suallar qəbul edir və tipli cavab qaytarır:

- `Choice`: ən çox 255 variantdan biri.
- `Score`: sıralı şkala.
- `Noul`: 0–1 ehtimal.

Hər cavabın yanında kalibrlənmiş `confidence` gəlir. Qiyməti: input $0.042/MTok, output pulsuz. Gecikmə: 70–500ms. JS SDK: `@typesafe-ai/sdk`.

Rəsmi sənədlərdə ("Jev 1.13 jaggedness") göstərilən məhdudiyyətlər:

- mətn yaratmır;
- rəqəmləri etibarlı müqayisə etmir, sayma aparmır;
- tarixləri sıralı kəmiyyət kimi yox, mətn kimi oxuyur;
- sualı hərfi oxuyur (inkarlar olduğu kimi qəbul olunur);
- lazımsız kontekst artdıqca dəqiqliyi düşür.

Azərbaycan dili barədə sənədlərdə heç nə yazılmayıb. Dəqiqlik rəqəmlərini şirkət özü ölçüb (Claude/GPT ilə razılaşma kimi), müstəqil yoxlama yoxdur.

## Qərar

### 1. Ümumi prinsiplər

- **AI heç vaxt yazmır.** AI yalnız təklif qaytarır. Yazma həmişə istifadəçinin təsdiqindən sonra mövcud `recordIncome`/`recordExpense` command-ları ilə olur. Command → Event qaydası (ADR-0001) pozulmur. ADR-0005-in ruhu da qorunur: maliyyə datasında LLM-ə kor etibar edilmir.
- **Kaskad:** əvvəl pulsuz və dəqiq açar söz qaydası yoxlanılır. Qayda tapılmasa Jev işə düşür. Jev də etibarlı cavab verməsə, sahə boş qalır və istifadəçi əl ilə seçir.
- **Best-effort.** Açar yoxdursa, timeout olarsa və ya provayder xətası baş verərsə AI addımı ötürülür və loglanır. Əsas axın AI-sız işləməyə davam edir. Bu, `EmailService` və `FxSyncService` fəlsəfəsi ilə eynidir.
- **Etibar həddi:** `JEV_CONFIDENCE_THRESHOLD`, başlanğıc dəyər 0.7. Bu, ölçülmüş dəyər deyil, sadəcə başlanğıcdır. Real Leobank datası ilə pilotda kalibrlənəcək.

### 2. Ortaq təbəqə

- `src/modules/jev/jev.client.ts` — nazik, inject olunan wrapper (`FrankfurterClient` nümunəsi ilə). Testlərdə `overrideProvider` ilə əvəzlənir.
  - Açar: `process.env.TYPESAFE_API_KEY`.
  - Model versiyası `process.env.JEV_MODEL` ilə sabitlənir. Bunun səbəbi `jev-latest`-in həddləri xəbərsiz dəyişə bilməsidir.
  - Timeout ~3s.
- `src/modules/categories/category-rule-matcher.ts` — mövcud açar söz uyğunlaşdırma məntiqi `preview()`-dən bu saf funksiyaya köçürülür. İdxal və assistant eyni funksiyadan istifadə edir.

### 3. Bank idxalında kateqoriya təklifi

- Qayda tapılmayan və daxili köçürmə olmayan sətirlər `(direction, təsvir)` üzrə qruplaşdırılır. Hər qrup üçün bir `Choice` sualı verilir; suallar 6-lıq batch-larla bir Jev sorğusunda göndərilir, sətir sayı çox olan qruplar əvvəl (bax "Real Leobank faylı ilə pilot").
- **Variantlar:**
  - yalnız istifadəçinin **öz** kateqoriyaları (ADR-0018), gözlənilən növə görə süzülmüş;
  - hər variant tam yol adı ilə (`"Yemək › Market"`);
  - üstəlik açıq **`__none__` ("heç biri uyğun deyil")** variantı. `Choice` həmişə nəsə seçir; bu variant olmasa Jev uyğun gəlməyən tacirə də ən yaxın kateqoriyanı zorla seçərdi.
- `__none__` seçilərsə və ya confidence həddən aşağıdırsa, təklif boş qalır.
- **Yeni kateqoriya təklif olunmur.** Jev ad yarada bilmir. Hazır kataloqdan seçim variantı (40–60 ad) müzakirə olundu, amma bu mərhələdə rədd edildi. İstifadəçi mövcud "+ Yeni kateqoriya" modalından istifadə edir.
- Növ üzrə kateqoriya sayı 255-dən çoxdursa, AI ötürülür (Jev-in limiti).
- Paralellik (3), retry, ümumi vaxt büdcəsi (25 s) və ardıcıl uğursuzluq kəsicisi ilə məhdudlaşdırılır; rate limit/provayder xətası preview-ni bloklamır.
- `PreviewRowDto`-ya iki sahə əlavə olunur:
  - `suggestionSource: 'rule' | 'internal_transfer' | 'ai' | null`
  - `suggestionConfidence`
- Web-də AI təklifləri rozetlə göstərilir. "Gələcək üçün xatırla" AI təklifli qruplarda da görünür, beləliklə qəbul edilən AI təklifi növbəti dəfə pulsuz qaydaya çevrilir.
- Preview əvvəlki kimi heç nə yazmır.

### 4. AI "sürətli əlavə" (assistant)

- Yeni `src/modules/assistant/`, öz cədvəli yoxdur. `POST /assistant/parse-transaction` `{ text }` → **təklif** qaytarır: istiqamət, məbləğ, valyuta, hesab, kateqoriya, `dayOffset`, qeyd, sahə üzrə confidence, xəbərdarlıqlar. Endpoint heç nə yazmır.
- **Deterministik parser** (`transaction-text.parser.ts`, saf funksiya). Jev mətndən rəqəm və tarix çıxara bilmədiyi üçün bu hissə kodda edilir:
  - məbləğ: `45`, `45.90`, `45,90`, `1 250,50`;
  - valyuta: `manat/azn/₼`, `dollar/usd/$`, `avro/euro/eur/€`;
  - gün sözləri: `bu gün/bugün`, `dünən`, `srağagün`.
  - **`dayOffset` qaytarılır, tarix yox.** `users`-də timezone yoxdur, yerli tarixi client hesablayır.
  - **Məlum məhdudiyyət:** sözlə yazılmış rəqəmləri ("qırx beş") və sərbəst tarix ifadələrini ("keçən cümə") tanımır.
- **Jev:** bir çağırışda 3 paralel `Choice` sualı verilir (istiqamət, hesab, kateqoriya). Jev sualları təcrid olunmuş şəkildə cavablandırır, ona görə kateqoriya sualı hər iki növün kateqoriyalarını növ etiketi ilə əhatə edir. Seçilən kateqoriyanın növü istiqamətlə uyğun gəlmirsə, kateqoriya atılır. Valyuta tapılıbsa, hesab variantları o valyutaya görə süzülür. Tək hesab qalırsa, sual verilmir.
- **Claude Haiku 4.5 ehtiyatı** (`claude-transaction-extractor.ts`, `@anthropic-ai/sdk`, model `claude-haiku-4-5`):
  - **Nə vaxt işə düşür:** parser məbləği tapmayanda (`amount_missing`), bir neçə rəqəm olanda (`multiple_amounts`), Jev əlçatan olmayanda, istiqamət həll olunmayanda və ya Jev-in seçdiyi hesab qeyri-müəyyən qalanda (dəqiq tətikləyici üçün aşağıdakı "Tətbiq zamanı dəqiqləşənlər" bölməsinə bax).
  - **Nəticə qarışdırılmır.** Claude-un nəticəsi parser/Jev nəticəsinin yerinə keçir və `source: 'claude'` kimi işarələnir. Səbəb: iki mənbənin sahələrini qarışdırmaq ziddiyyətli təklif yarada bilər (məs. Jev-in hesabı + Claude-un valyutası).
  - **Structured outputs:** `client.messages.parse()` + `zodOutputFormat`. `accountId`/`categoryId` sxemdə istifadəçinin real id-lərinin enum-u (+ `null`) kimi verilir, beləliklə mövcud olmayan id qaytarılması sxem səviyyəsində mümkün olmur.
  - **Limitlər:** timeout 8s, `maxRetries: 1`, `max_tokens` ~512. `refusal`/`max_tokens`/`parsed_output === null` halları ehtiyatın uğursuzluğu sayılır.
  - **Açar:** `process.env.ANTHROPIC_API_KEY`. Açar yoxdursa ehtiyat söndürülür.
  - **Xərc:** bir çağırış təxminən $0.002–0.003 (Haiku 4.5: $1/$5 per MTok, ~1–2k input). Yalnız ehtiyat hallarında çağırılır.
- **Web:** Dashboard və Ledger-də mətn sahəsi → redaktə olunan təsdiq kartı. Aşağı etibarlı və ya boş sahələr vurğulanır. "Təsdiqlə" mövcud `recordIncome`/`recordExpense`-i çağırır.
- **Event aidiyyəti:** yazmanı istifadəçi web client-də təsdiq edir, ona görə `events.client_id` web client-i olaraq qalır. Ledger DTO və event sxemi **dəyişmir**. Ledger mərkəzi moduldur, "mənbə" sahəsi əlavə etmək bütün asılı modulları təsir edərdi. `ai_chat` client növü gələcək müstəqil chat client-i (çox addımlı dialoq, MCP) üçün saxlanılır.

### 5. Məxfilik

İstifadəçi ilə qərarlaşdırılıb: AI **həmişə aktivdir**, ayarlarda keçid yoxdur. Göndərilən məlumat:

- **TypeSafe:** idxal zamanı tacir təsvirləri, məbləğ və istiqamət; assistant-da isə mətn, hesab adları və kateqoriya adları.
- **Anthropic:** yalnız ehtiyat hallarında, assistant mətni və hesab/kateqoriya siyahısı.

Provayderlərin şərtləri (2026-09-24 tarixində yoxlanılıb):

- **TypeSafe** (typesafe.ai/legal/privacy-policy): "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input". Input xidmət provayderlərindən başqa üçüncü tərəfə ötürülmür. **Saxlama müddəti siyasətdə göstərilmir.** Üçüncü tərəf mənbələrinə görə sıfır saxlama (ZDR) yalnız enterprise müştərilərə sorğu ilə verilir. Data Processing Addendum ayrıca sənəddir.
- **Anthropic API:** input və output-lar standart olaraq 30 gün ərzində silinir, ZDR müqavilə ilə mümkündür. API datasının təlim üçün istifadəsi barədə baxılan səhifədə açıq ifadə yoxdur, bunu kommersiya şərtlərindən ayrıca yoxlamaq lazımdır.

`POST /auth/delete-data` bizim DB-dəki bütün datanı silir. Provayderlərdə saxlanılan kopyalara (saxlanılırsa) təsir etmir. İstifadəçiyə açıqlanan məxfilik mətnində bu qeyd edilməlidir.

## Tətbiq zamanı dəqiqləşənlər

Plandan fərqli və ya plana əlavə olan qərarlar:

- **Claude ehtiyatının tətikləyicisi dəqiqləşdi:** plan "istiqamət və ya hesab üzrə confidence aşağıdır" deyirdi. Amma mətndə hesab adı yoxdursa Jev-in `__none__` cavabı normaldır və Claude da bunu dəyişməz, hər belə sorğuda Claude çağırmaq pul itkisi olardı. Ona görə tətikləyicilər: `amount_missing`, `multiple_amounts`, Jev uğursuz olması, istiqamətin həll olunmaması və **Jev-in real hesab seçib, amma etibarının həddən aşağı olması** (`__none__` sayılmır).
- **Hesab həlli Jev-dən əvvəl deterministikdir:** mətndə hesabın adı keçirsə (ən uzun uyğunluq, bərabərlikdə seçim yoxdur) və ya valyuta filtrindən sonra tək hesab qalırsa Jev-ə hesab sualı verilmir.
- **Qayda uyğunluğu yalnız bir növdə olanda** istiqaməti və kateqoriyanı təyin edir (eyni açar söz həm gəlir, həm xərc kateqoriyasında varsa qeyri-müəyyəndir, Jev-ə buraxılır).
- **Yeni xəbərdarlıq `no_account_in_currency`:** mətndəki valyutada hesab yoxdursa (məs. "10 avro", yalnız AZN/USD hesabları). Hesab namizədləri bu halda süzülmür.
- **Kateqoriya-istiqamət uyğunluğu:** Jev-ə iki sual eyni anda təcrid olunmuş verildiyi üçün kateqoriya sualı hər iki növü əhatə edir. Sonra növ istiqamətlə uyğun gəlmirsə kateqoriya atılır; istiqamət qeyri-müəyyəndirsə, əmin kateqoriyanın növündən çıxarılır.
- **"Daxili köçürmə" kateqoriyaları AI variantlarından çıxarılıb** (idxalda ayrıca yolla, assistant-da isə real gəlir/xərc deyil).
- **Confidence çıxışı:** həddən aşağı sahə `null` qaytarılır, amma real bal `confidence`-də qalır ki, client vurğulaya bilsin. Qayda/adla həll edilmiş sahə üçün bal 1-dir. Claude bal qaytarmır (`null`).
- **"Gələcək üçün xatırla"** AI təklifli qruplarda görünür, amma **default söndürülüdür** (təklifsiz qruplarda default açıqdır): səhv AI təklifi xəbərsiz daimi qaydaya çevrilməsin.
- **Claude promptunda yerli tarix Asia/Baku** saat qurşağı ilə verilir ("keçən cümə" kimi ifadələr üçün). `dayOffset` isə client-də öz yerli tarixinə tətbiq olunur — iki saat qurşağı fərqli olsa bir günlük sürüşmə mümkündür, təsdiq kartındakı tarix sahəsi bunu istifadəçiyə göstərir.
- **Web client `recordIncome`/`recordExpense`-ə `occurredAt` göndərir** (backend DTO-su artıq qəbul edirdi). Bu günkü tarix üçün göndərilmir (backend indiki anı yazır), keçmiş tarix yerli günorta (12:00) kimi göndərilir.

## Baxılan alternativlər

- **İdxal üçün Claude:** rədd edildi. Hər qrup üçün LLM çağırışı Jev-dən qat-qat bahalı və yavaşdır. Kateqoriya seçimi məhdud variantlı sualdır, Jev məhz bunun üçündür.
- **Assistant üçün yalnız Jev + parser:** rədd edildi. Parser real ifadələrin bir hissəsini tanımayacaq. Claude ehtiyatı bu halları istifadəçiyə əl ilə doldurtmadan həll edir.
- **Assistant üçün yalnız Claude:** rədd edildi. Sadə ifadələr ("Bravo 45 manat") üçün Jev + parser daha ucuz və sürətlidir.
- **Yüksək etibarda avtomatik yazma:** rədd edildi. Event log append-only-dir. Səhv yazı silinmir, yalnız düzəlişlə kompensasiya olunur.
- **Tam chat interfeysi:** bu mərhələdə rədd edildi. Streaming, söhbət tarixçəsi və çox addımlı dialoq xeyli böyük işdir. Sürətli əlavə əsas ehtiyacı (tez xərc qeydi) ödəyir.
- **Ayarlarda AI keçidi və ya opt-in:** istifadəçi qərarı ilə rədd edildi. Nəticəsi yuxarıdakı məxfilik bölməsindədir.

## Nəticələr

- **Yeni asılılıqlar:** `@typesafe-ai/sdk`, `@anthropic-ai/sdk`, `zod` (core-da). Yeni env dəyişənləri: `TYPESAFE_API_KEY`, `JEV_MODEL`, `ANTHROPIC_API_KEY`. Bunlar lokal `.env`-də və Railway-də olmalıdır, commit olunmur.
- **İki xarici provayderdən asılılıq yaranır.** Hər ikisi best-effort-dur: açarsız və ya xəta halında sistem AI-sız tam işləyir.
- **Jev erkən girişdədir.** API və SDK (0.x) dəyişə bilər. Model versiyası sabitlənir, SDK wrapper arxasında gizlədilir ki, dəyişiklik bir faylda qalsın.
- `docs/MODULES.md` (§4, §9, §10) və `.claude/rules/module-dependencies.md` yenilənib.
- **Pilotdan sonra:** etibar həddi kalibrlənir. Assistant-da hansı yolun (parser+Jev və ya Claude) nə qədər dəqiq olduğu ölçülür, nəticə bu ADR-ə əlavə olunur.

## Canlı pilot nəticələri (2026-09-24)

Real API-lərlə, təcrid olunmuş backend-də (port 3097), müvəqqəti test istifadəçisi ilə (sonra `/auth/delete-data` ilə silindi). Jev **Vercel AI Gateway** üzərindən çağırıldı: `TYPESAFE_BASE_URL=https://ai-gateway.vercel.sh/typesafe`, `JEV_MODEL=typesafe-ai/jev` (TypeSafe-in öz qeydiyyatı bağlı olduğu üçün; SDK dəyişməyib, kodda dəyişiklik lazım olmadı). Gateway hesabında kart olmalıdır, yoxsa 403.

**İdxal (sintetik CSV, 22 sətir, default kateqoriyalar):** 12 sətir AI təklifi aldı; gözlənilən kateqoriyası olan 17 sətirin 17-si düzgün (səhv 0). Ən aşağı düzgün etibar 0.77 (Carrefour), 0.79 (Araz Market); 0.7 həddi bu nümunədə düzgün təklifi kəsmədi. Uyğun kateqoriyası olmayan (Zara, ATM, şəxs adı, naməlum mağaza) sətirlər boş qaldı; Zeytun Apteka `Digər xərc`-ə düşdü (0.92, məntiqlidir). 22 sətir preview ~7.4 s çəkdi. **Məhdudiyyət:** sintetik və məşhur tacirlərdir, real Leobank təyinatları (qısaldılmış, latın/kiril qarışığı) ilə yoxlanılmayıb.

**Assistant (24 ifadə):** istiqamət 23/24, gözlənilən kateqoriya 18/20, hesab (mətndə ipucu olan) 4/4. 18 ifadə parser+Jev (~0.4–0.7 s), 6 ifadə Claude ehtiyatı (~2–6 s). Claude sözlə yazılmış rəqəmləri ("qırx beş", "iki yüz") və məbləğsiz mətni düzgün həll etdi. Zəif yerlər: "qaz və su" kateqoriyası boş qaldı (Jev 0.3); "hədiyyə aldım" mənalı ikili olduğu üçün gəlir seçildi; Claude ipucu olmadan hesab seçə bilir ("qırx beş manat çörək aldım" → Nağd), təsdiq kartı bunu istifadəçiyə göstərir. Claude structured-output sxemi API tərəfindən qəbul olundu (6/6 uğurlu çağırış).

**Nəticə:** 0.7 həddi saxlanılır. Real Leobank təyinatları ilə təkrar pilot və Claude-un ipucusuz hesab seçimini məhdudlaşdırmaq (prompt) açıq qalır.

## Real Leobank faylı ilə pilot (2026-09-24)

Fayl: 985 sətir, 231 unikal `(istiqamət, təyinat)` qrupu, istifadəçinin yeni 42 kateqoriyalı ağacı ilə (müvəqqəti test istifadəçisi, sonra silindi). Yalnız preview edildi, heç nə commit olunmadı.

**Tapıntı 1 — provayder qeyri-sabitdir.** Jev Vercel AI Gateway üzərindən təsadüfi 429 ("upstream provider is currently experiencing high demand"), 503 və 5+ saniyə asılan çağırışlar verdi. Ölçüdən və paralellikdən asılı görünmədi: tək çağırışlarda belə ~1 çağırış/san. tempində təxminən yarısı uğursuz oldu. Ölçülən tək çağırış gecikməsi normal halda 0.3–0.6 s.

**Tapıntı 2 — ilk tətbiq (qrup başına 1 sorğu, 5 paralel) real faylda işləmirdi.** SDK-nın `timeout`-u tək cəhdi məhdudlaşdırır, 429/503 üçün retry isə ~1 dəqiqə gözləyə bilirdi; preview 72 s+ asıldı (bir dəfə 5 dəqiqədən çox). Düzəlişlər:
- `JevClient`: bütün cəhdlər üçün 6 s sərt üst hədd (`Promise.race`).
- `CategoryAiSuggester`: qruplar sətir sayına görə azalan sırayla, **6-lıq batch-larla** (bir sorğuda 6 ayrı `Choice` sualı) göndərilir; batch başına 3 retry (400 ms aralıq), 3 ardıcıl uğursuz batch-dan sonra dayanır, ümumi vaxt büdcəsi 25 s. Preview indi ≤~30 s-də bitir.
- Maskalı kart nömrələri (`552209****8061`) Jev-ə göndərilmir (kateqoriyası bilinməz, kvotanı yeyir).

**Tapıntı 3 — keyfiyyət yaxşıdır, əhatə provayderdən asılıdır.** Müxtəlif run-larda cəmi 25 qrup təklif aldı və hamısı məntiqli idi (AzParking→Nəqliyyat › Parking, Uber/Bolt→Taksi, Socar→Yanacaq, Azərişıq→Ev › Elektrik, Nar/Bakcell→Mobil balans, Araz/Spar/Bazarstore→Mağaza, Second Cup/CoffeeLea→Çay / Kofe, Gloria Jeans→Geyim). Təklif alan sətir sayı run-dan run-a 0 ilə 466 (985-dən) arasında dəyişdi, çünki Jev sorğuları uğursuz olurdu; uğursuz olanda təklif sadəcə boş qalır (best-effort). Gəlir sətirləri (MilliÖn/Anipay/eManat topup-ları) valideyn `Gəlir`-ə düşdü (0.7–0.9), bunlar əslində daxili köçürməyə yaxındır. Neptun kimi yerli market Jev-ə tanış deyil (`__none__`).

**Nəticə / açıq qalanlar:**
- 0.7 həddi saxlanılır. Provayder sabitləşəndən sonra eyni faylı təkrar ölçmək lazımdır (əhatə rəqəmi indiki qeyri-sabitliyi əks etdirir, Jev-in imkanını yox).
- İdxalda ən çox təkrarlanan tacirlər üçün "Gələcək üçün xatırla" qaydası (pulsuz, provayderdən asılı olmayan) əsas həll olaraq qalır: AI təklifi bir dəfə qəbul edilsə, sonrakı idxallarda Jev-ə ehtiyac yoxdur.
- Uğursuz sorğular bu gün ~50% idi; bu davam edərsə, provayder seçimini (birbaşa TypeSafe API vs Gateway) yenidən qiymətləndirmək lazımdır.
