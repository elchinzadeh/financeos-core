# ADR-0013: Hesab deaktivasiyası, GDPR silinməsi, balans reconciliation

Tarix: 2026-09-12
Status: accepted

## Kontekst

`docs/MODULES.md` §1 Identity & Access-in "Hesab deaktivasiyası, məlumatların silinməsi" funksiyasını, §3 isə `account_balances` cache-inin `events`-dən yenidən qurula bilməli olduğunu (ADR-0001/0002) tələb edir. Hər ikisi indiyədək kənarda saxlanılmışdı.

## Qərar

1. **Deaktivasiya (`POST /auth/deactivate`)** — parol təsdiqi tələb edir, `users.deactivated_at`-ı doldurur, istifadəçinin bütün client-lərinin bütün sessiyalarını dərhal ləğv edir. `login()` bundan sonra rədd edir. Geri qaytarma (reaktivasiya) endpoint-i yoxdur — bu, birbaşa DB müdaxiləsi tələb edən qəsdən minimalist MVP qərarıdır.
2. **Data silinməsi (`POST /auth/delete-data`)** — parol təsdiqi tələb edir, istifadəçiyə aid **bütün** sətirləri (`ledger_entries`, `account_balances`, `goals`, `budgets`, `events`, `accounts`, öz `categories`, `sessions`, `clients`, `users`) bir `$transaction`-da geri dönməz şəkildə silir.

   **Bu, `docs/decisions/0001-event-sourced-command-layer.md`-in "events heç vaxt silinmir/dəyişmir" prinsipini bilərəkdən pozur.** Səbəb: o prinsip "sistem mövcud olduğu müddətdə tarixçə audit-lənə bilsin" deməkdir — istifadəçi GDPR-ə görə tam silinmə tələb edəndə isə "kimin tarixçəsini qoruyuruq?" sualı mənasını itirir. Silinmiş istifadəçinin event-lərini saxlamaq nə audit dəyəri yaradır, nə də hüquqi tələbi ödəyir (əksinə, ziddiyyət yaradır).
3. **Reconciliation (`POST /ledger/reconcile`)** — `account_balances`-i `ledger_entries`-dən yenidən hesablayan sadə servis metodudur, **command/event deyil**. `accountId` verilməzsə istifadəçinin bütün hesabları (arxivlənmiş daxil) reconcile olunur. Cache `increment` yox, tam `set` ilə əvəz olunur (hər dəfə sıfırdan hesablanır) ki, əvvəlki səhv artıq təsir etməsin.

## Baxılan alternativlər

- **Data silinməsində `events`-i saxlamaq, yalnız PII-ni anonimləşdirmək** (crypto-shredding) — daha "təmiz" event-sourcing həlli olardı, amma `payload`/`accounts.name`/`categories.name` kimi sahələrdə səpələnmiş PII-ni tam təmizləmək mürəkkəb sxem auditi tələb edir; MVP üçün tam silmə daha sadə və etibarlıdır.
- **Reconciliation-u event kimi yazmaq** (`BalanceReconciled` event) — rədd edildi: bu, yeni maliyyə faktı yaratmır, mövcud faktlardan mövcud cache-i düzəldir — ADR-0001-in "hər command bir event yaradır" qaydası yeni **fakt**lara aiddir, cache təmizləməyə yox.

## Nəticələr

- Data silinməsi test-lərdəki `cleanupTestUser` helper-inin production analoqudur — eyni FK sırası.
- Parol sıfırlama (email provider) və Currency & FX gündəlik cron (xarici FX API) xarici infrastruktur/credential tələb etdiyi üçün bu ADR-in əhatəsindən kənarda qalır, `docs/PROGRESS.md`-də ayrıca açıq addım kimi qeyd olunub.
