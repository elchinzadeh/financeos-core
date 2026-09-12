# Test qaydaları

- `events` və ya `ledger_entries`-ə toxunan hər şey üçün test lazımdır — nəticə **projeksiyasını** yoxlayan, təkcə command-ın xəta atmadığını yox.
- Bir modulda dəyişiklik etdikdən sonra, `.claude/rules/module-dependencies.md`-dəki cədvələ bax və ona asılı olan modulların testlərini də işə sal, dəyişikliyi "bitdi" saymazdan əvvəl.
- Tək bir command-ı təcrid olunmuş yoxlayan testdən çox, bir neçə event-i ardıcıl "replay" edib son projeksiyanı yoxlayan test üstünlük təşkil etsin — event sourcing-in bütün mənası elə ardıcıllığın önəmli olmasıdır (məs. transfer + sonra kateqoriya dəyişikliyi + sonra restore).
- Transfer (`transferBetweenAccounts`) testlərində hər zaman hər iki `ledger_entries` sətrini (debit + credit tərəfini) yoxla, təkcə birini yox.
- Valyuta ilə bağlı testlərdə köhnə tarixli bir əməliyyatın bugünkü FX kursu dəyişəndə də eyni nəticəni verdiyini yoxla (`fx_rate_to_base` donmuş olmalıdır).

## Komandalar

NestJS-in bu layihədəki scaffold-u Vitest istifadə edir (Jest yox — `nest new` bu versiyada default olaraq Vitest qurur), paket meneceri pnpm:

- Unit testlər: `pnpm test`
- E2E testlər: `pnpm test:e2e`
- Tək fayl: `pnpm test -- ledger.spec.ts`
