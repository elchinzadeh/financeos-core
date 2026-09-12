# ADR-0003: MVP əhatəsi — nə indi qurulur, nə sonraya saxlanılır

Tarix: 2026-09-12
Status: accepted

## Kontekst

Tam vizyona rule builder, MCP write-access, bank/fintech inteqrasiyaları, OCR, SMS parsing, granular permission, investisiya izləmə daxildir. Hamısını eyni anda qurmağa çalışmaq layihəni heç vaxt bitirməmək riski yaradır.

## Qərar

**MVP-yə daxildir:** Identity & Access, Accounts, Ledger, Categories, Currency & FX (gündəlik kurs), Net Worth (sadə görünüş), Budget & Rules (2-3 hardcoded şablon, amma `definition` sahəsi gələcək builder-in yazacağı JSON formatında), Goals (statik hədəf məbləği), AI Assistant (chat, mətn/səs giriş) — bir command-layer client kimi.

**Sonraya saxlanılıb** (data modeli yer saxlayır, amma UI/inteqrasiya qurulmur): rule builder UI, MCP (xüsusilə write + confirmation axını), bank/fintech inteqrasiyaları (Plaid/Salt Edge/Wise/Payoneer), OCR, SMS parsing, granular per-client permission UI, investisiya hesabları, ayrıca Debt/Credit modulu (MVP-də sadəcə `accounts.type='loan'`).

## Baxılan alternativlər

- **Hər şeyi paralel qurmaq** — rədd edildi: resurs həddindən artıq genişlənir, heç bir hissə tez bitmir, validasiya gecikir.
- **MCP-ni MVP-yə daxil etmək** — rədd edildi: confirmation/elicitation axını həm texniki, həm təhlükəsizlik baxımından ən ağır hissədir; core API sabit işləmədən üstünə əlavə etmək risklidir (bax ADR-0005).

## Nəticələr

- `budgets.definition` JSON sxemi builder olmadan da əvvəlcədən düzgün seçilməlidir — əks halda builder gələndə migration lazım olacaq.
- MCP, bank sync və OCR "adapter" kimi əlavə olunacaq (ADR-0001-dəki command layer sayəsində) — əsas modullara toxunulmayacaq.
- Bu sənəd köhnəlmiş ola bilər: scope dəyişəndə (yeni bir şey MVP-yə daxil edilir/çıxarılır) bu ADR-i "superseded" et və yenisini yaz, `docs/PROGRESS.md`-i də yenilə.
