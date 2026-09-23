# ADR-0019: Email infrastruktur (Resend) və parol sıfırlama

Tarix: 2026-09-23
Status: accepted

## Kontekst

`docs/decisions/0013-account-deactivation-and-reconciliation.md`-in "Nəticələr" bölməsi parol sıfırlamanı email provider tələb etdiyi üçün açıq buraxmışdı (`docs/PROGRESS.md`-də ayrıca bloklanmış maddə kimi izlənilirdi). İstifadəçi Resend.com-u provider seçdi, real API açarını verdi (`.env`-ə yazıldı, `.env`/`RESEND_API_KEY` heç vaxt git-ə commit olunmur) və göndərən ünvan üçün Resend-in paylaşılan test domenini (`onboarding@resend.dev`) istədi. Əhatə bilərəkdən "parol sıfırlama"dan geniş tutuldu — gələcək email növləri (xoş gəldin və s.) üçün də təkrar istifadə oluna bilən ümumi infrastruktur.

## Qərar

1. **Ümumi `src/modules/email/` modulu**: `EmailService.send({to, subject, html})` — Resend SDK-nı sarır (`new Resend(process.env.RESEND_API_KEY)`), `from` `process.env.EMAIL_FROM` ilə (default `FinanceOS <onboarding@resend.dev>`). Email şablonları (`templates/password-reset.template.ts`) ayrıca, sadə funksiyalardır (HTML string qaytarır) — React/render kitabxanası əlavə edilmədi, bu miqyasda artıq mürəkkəblikdir.

2. **`EmailService.send()` heç vaxt xəta atmır** — Resend API xətası (həm cavabdakı `error`, həm şəbəkə səviyyəli istisna) `Logger.error` ilə loglanır, çağıran tərəfə ötürülmür. Səbəb: email "best-effort" hesab olunur — `forgot-password` kimi endpoint-lərin nəticəsi provider-in anlıq etibarlılığından asılı olmamalıdır. Bu həm də test-lərin real Resend API-yə qarşı sınandıqda (sandbox domeni yalnız hesab sahibinin öz email-inə çatdıra bilir) uğursuz olmamasını təmin edir.

3. **`@nestjs/config` əlavə edilmədi** — mövcud konvensiya (birbaşa `process.env.X` oxumaq, `main.ts`/`prisma.service.ts`-dəki kimi) qorunub.

4. **Parol sıfırlama**: yeni `PasswordResetToken` modeli, `Session`-dəki `tokenHash`+`expiresAt` naxışının təkrarı (`identity.service.ts`-dəki mövcud `generateToken()`/`hashToken()` funksiyaları təkrar istifadə olundu). Fərqlər: `usedAt` sahəsi (bir-dəfəlik istifadə), 1 saatlıq etibarlılıq (sessiyanın 30 günündən qəsdən qısa), `userId` FK-si `onDelete: Cascade` (Session-dan fərqli qərar — bu token-lərin istifadəçisiz mənası yoxdur, kateqoriyalardakı `SET NULL`-a bağlı əvvəlki sızma bug-una bənzər risk yoxdur, çünki başqa heç kimə "keçmir").
   - `POST /auth/forgot-password` (`ForgotPasswordDto{email}`) — istifadəçi tapılmasa da **həmişə** `{ok:true}` qaytarır (email-in mövcudluğunu sızdırmamaq üçün). Tapılarsa token yaradılır, `${CORS_ORIGIN-in ilk hissəsi}/reset-password?token=...` linki ilə email göndərilir — yeni bir "frontend URL" env dəyişəni əvəzinə mövcud `CORS_ORIGIN`-in təkrar istifadəsi (bu onsuz da frontend origin-idir).
   - `POST /auth/reset-password` (`ResetPasswordDto{token,password}`) — token `usedAt IS NULL` və `expiresAt > now` olmalıdır, əks halda 400. Uğurda: parol yenilənir, token `usedAt` işarələnir, **istifadəçinin bütün sessiyaları ləğv olunur** (`deactivate()`-dəki eyni nümunə).

## Baxılan alternativlər

- **Token-i API cavabında qaytarmaq (test asanlığı üçün)** — rədd edildi: bu, token-i email-dən başqa bir kanalda ifşa edərdi, təhlükəsizlik prinsipini pozardı. Test-lərdə `EmailService`-i `overrideProvider` ilə əvəz edib göndərilən HTML-dən token-i çıxarmaq yolu seçildi (`test/identity.e2e-spec.ts`).
- **`PasswordResetToken.userId` FK-sini `SET NULL` etmək (Category-dəki kimi)** — rədd edildi: bu token-lərin istifadəçisiz saxlanmasının heç bir mənası yoxdur, `Cascade` daha doğru və sadədir.
- **React-email və ya oxşar şablon kitabxanası** — rədd edildi: tək bir sadə email üçün əlavə asılılıq artıq mürəkkəblikdir; sadə funksiya (`passwordResetEmailHtml`) kifayətdir.
- **Email göndərilməsini növbəyə (queue) almaq / retry mexanizmi** — rədd edildi: hazırkı həcm üçün lazımsızdır, `send()`-in sinxron best-effort davranışı kifayətdir; həcm/etibarlılıq tələbi artarsa yenidən nəzərdən keçirilə bilər.

## Nəticələr

- Yeni asılılıq: `resend` (npm).
- Miqrasiya: `password_reset_tokens` cədvəli (`20260923090000_add_password_reset_tokens`).
- `.env`/`.env.example`-ə `RESEND_API_KEY`, `EMAIL_FROM` əlavə olundu.
- `docs/PROGRESS.md`-dəki "Parol sıfırlama axını — bloklanıb" maddəsi bağlandı.
- `test/app.e2e-spec.ts`-də tapılan əlaqəsiz bug düzəldildi: bu fayl (təkcə bu fayl) `import 'dotenv/config'`-u çatışmırdı — `EmailService`-in konstruktorda sinxron `RESEND_API_KEY` tələb etməsi bunu üzə çıxardı (əvvəllər heç bir modul konstruktor-vaxtı env dəyişəninə sərt tələb qoymurdu).
