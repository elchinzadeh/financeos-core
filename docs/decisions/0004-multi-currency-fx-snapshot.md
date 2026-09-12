# ADR-0004: Çox-valyutalı dəstək gündən 1, FX kursu hər sətirdə donur

Tarix: 2026-09-12
Status: accepted

## Kontekst

İstifadəçi bir neçə valyutada (AZN, USD, EUR və s.) hesab saxlayacaq, kurs gündəlik yenilənəcək. Keçmiş əməliyyatların hesabatı zaman keçdikcə dəyişməməlidir.

## Qərar

`fx_rates` cədvəli `(base_currency, quote_currency, rate_date)` üzrə tarixi kursları saxlayır. Hər `ledger_entries` sətri yaradıldığı andakı kursu `fx_rate_to_base` sütununda dondurub saxlayır. Net worth və hesabatlar bu donmuş kursla hesablanır, bugünkü kursla yenidən hesablanmır.

## Baxılan alternativlər

- **Tək-valyutalı MVP, çox-valyutanı sonraya saxlamaq** — rədd edildi: istifadəçi açıq şəkildə çox-valyutalı dəstək istəyib, sonradan miqrasiya etmək baha başa gələcək (ADR-0001 və ADR-0002-nin əsasını yenidən qurmaq deməkdir).
- **Hesabatı hər dəfə bugünkü kursla hesablamaq (canlı konversiya)** — rədd edildi: keçmiş ayın hesabatı hər gün fərqli görünər, istifadəçi üçün çaşdırıcı və etibarsız olar.

## Nəticələr

- Hər ledger yazısı bir az əlavə sahə (`fx_rate_to_base`) daşıyır, amma bu, hesabatların zamanla sabit qalmasını təmin edir.
- `fx_rates`-in gündəlik yenilənməsi ayrı, sadə bir cron job-dur — Ledger-in özünə bağlı deyil (bax `docs/MODULES.md` → Currency & FX).
