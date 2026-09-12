# ADR-0011: Net Worth & Reporting — FX strategiyası, arxivlənmiş hesablar

Tarix: 2026-09-12
Status: accepted

## Kontekst

Net Worth & Reporting `docs/MODULES.md` §6-ya görə leaf, yalnız-oxuyan moduldur, öz cədvəli yoxdur — `ledger_entries` + `fx_rates` üzərində agregasiya. İki fərqli funksiya (net worth zaman xətti və kateqoriya üzrə hesabat) fərqli FX-yanaşması tələb etdi.

## Qərar

1. **Net worth = canlı (tarixli) FX kursu ilə, kateqoriya hesabatı = donmuş `fx_rate_to_base` ilə.** Net worth bir **stok** kəmiyyətdir (müəyyən tarixdəki balans) — o tarixin FX kursu ilə çevrilir (`CurrencyFxService.getRate(valyuta, baseCurrency, tarix)`). Kateqoriya hesabatı isə diskret **əməliyyatların cəmidir** (axın) — ADR-0004-ün "hesabat zamanla dəyişməsin" prinsipinə görə hər sətrin öz donmuş `fx_rate_to_base`-i ilə cəmlənir, yenidən kurs axtarılmır.
2. **Arxivlənmiş hesablar net worth-a daxildir.** Arxivləmə (`docs/decisions/0010-ledger-command-layer.md`) sadəcə "aktiv siyahıda göstərmə" bayrağıdır, balansı sıfırlamır — pul real olaraq hələ də mövcuddur.
3. **Timeline nöqtə sayı 366 ilə məhdudlaşdırılır.** Hər nöqtə hesabların sayı qədər DB sorğusu tələb edir; `docs/MODULES.md`-in özü bunun uzunmüddətli həllinin materialized view olduğunu qeyd edir — bu hələ qurulmayıb.

## Baxılan alternativlər

- **Net worth üçün də donmuş `fx_rate_to_base`-i cəmləmək** (yəni `SUM(amount * fx_rate_to_base)` bütün tarixçə üzrə) — rədd edildi: riyazi cəhətdən işləyər, amma konseptual cəhətdən yanlışdır — köhnə bir əməliyyatın "o vaxtkı" kursu ilə bugünkü balansı çevirmək, balansın **bugünkü** dəyərini deyil, keçmiş əməliyyatların cəmini verər (əsas fərq: stok vs axın).
- **Arxivlənmiş hesabları net worth-dan çıxarmaq** — rədd edildi: istifadəçini çaşdırardı (balans qəfil "yoxa çıxar"), maliyyə baxımından səhvdir.

## Nəticələr

- İki fərqli FX-yanaşmanın eyni modulda yanaşı olması sonradan "uyğunsuzluq" kimi görünə bilər — bu ADR onun qəsdən belə olduğunu sənədləşdirir.
- Böyük tarix aralıqlı timeline sorğuları yavaş ola bilər (hər nöqtə = hesab sayı qədər sorğu); performans problem olsa, həll `account_balances`-ə bənzər gündəlik snapshot cədvəli/materialized view-dir, komanda qatını dəyişmədən.
