# Modul asılılıq xəritəsi

Bir modulu dəyişməzdən əvvəl aşağıdakı cədvələ bax. Yuxarı axın (upstream) modulu yoxlamadan dəyişmək bu layihədə ən çox rast gəlinən "səssiz bug" mənbəyidir — dəyişiklik özü işləyir, amma ona asılı olan başqa modulun gözlədiyi forma/davranış dəyişdiyi üçün orada bug yaranır.

| Modul | Asılıdır | Ondan asılıdır |
|---|---|---|
| Identity & Access | — | bütün modullar (permission yoxlaması) |
| Accounts | Identity | Ledger, Net Worth, Goals, Statement Import, AI Assistant |
| Ledger (events + ledger_entries) | Accounts, Categories, Currency & FX | Net Worth, Budget, Goals, Audit, Statement Import |
| Categories | — | Ledger, Budget, Net Worth, Statement Import, AI Assistant |
| Currency & FX | — | Ledger, Net Worth |
| Net Worth & Reporting | Ledger, Currency & FX | — (yalnız oxuyan leaf) |
| Budget & Rules | Categories, Ledger (oxuma) | — |
| Goals | Accounts, Ledger (oxuma) | — |
| Statement Import (bank çıxarışı idxalı) | Accounts, Categories, Ledger (`recordIncome`/`recordExpense` vasitəsilə yazır), Jev (AI kateqoriya təklifi, best-effort) | — |
| AI Assistant (sürətli əlavə) | Accounts (oxuma), Categories (oxuma + `category-rule-matcher`), Jev, Claude (ehtiyat); yazmır — təsdiqdən sonra client Ledger command-larını çağırır | — |
| Jev (`src/modules/jev/`) | — (xarici TypeSafe API, best-effort) | Statement Import, AI Assistant |

## Praktik qayda

**Ledger** — hər şeyin oxuduğu mərkəzi moduldur. Onun event sxemini, `ledger_entries`-in sütunlarını, ya da `transaction_group_id` məntiqini dəyişəndə:

1. "Ondan asılıdır" sütununda Ledger-i olan hər modulu tap (Net Worth, Budget, Goals, Audit).
2. Onların Ledger-dən oxuduğu sorğuları/query-ləri yoxla — sxem dəyişikliyi onları sındırırmı?
3. Həmin modulların testlərini işə sal, dəyişikliyi "bitdi" saymazdan əvvəl.

Eyni məntiq Accounts, Categories, Currency & FX üçün də keçərlidir — cədvəldəki "Ondan asılıdır" sütununa bax.

## Yeni asılılıq yaradanda

Yeni bir modul əlavə etsən, ya da mövcud modula yeni bir asılılıq gətirsən (məs. Budget indi Goals-a da baxmalıdırsa), bu cədvəli yenilə. Köhnəlmiş asılılıq xəritəsi faydasızdır.
