# ADR-0009: Identity & Access — auth strategiyası

Tarix: 2026-09-12
Status: accepted

## Kontekst

Identity & Access ilk tam tətbiq olunan modul idi, bu isə bir neçə qərar tələb etdi: register/login `.claude/rules/architecture.md`-dəki Command→Event→Projection axınından keçməlidirmi? Sessiya token-i necə saxlanılmalıdır? Parol necə hash-lənməlidir? Permission yoxlaması nə qədər dərin olmalıdır?

## Qərar

1. **Identity & Access Command→Event→Projection-dan keçmir.** `.claude/rules/architecture.md`-dəki qadağa yalnız `accounts`/`ledger_entries`/`budgets`/`goals` cədvəllərini əhatə edir; `users`/`clients`/`sessions` bu siyahıda yoxdur və `events` cədvəli hələ mövcud deyil (Ledger mərhələsinə saxlanılıb). `IdentityService` `users`/`clients`/`sessions`-a birbaşa Prisma ilə yazır, çoxlu-sətirli əməliyyatlar (`register`, `login`) bir `$transaction` daxilində. Səbəb: auth state-i "replay" edilməli maliyyə tarixçəsi deyil, infrastrukturdur — event-sourcing burada faydasız mürəkkəblik əlavə edərdi.
2. **Sessiya token-ləri opaque, hash-lənmiş** — JWT yox. `crypto.randomBytes(32)` ilə xam token yaradılır, client-ə bir dəfə qaytarılır; `sessions.token_hash`-da onun SHA-256 hash-i saxlanılır. Hər sorğuda gələn `Authorization: Bearer <token>` yenidən hash-lənib DB-də axtarılır.
3. **Parol hashing: `bcryptjs`**, native `bcrypt` yox.
4. **İndi yalnız sessiya-səviyyəli autentifikasiya tətbiq olunur** (`SessionAuthGuard`: token keçərlidirmi, bitməyibmi, client `revoked_at`-ı yoxdurmu). `clients.scopes` sahəsi yazılır (boş massiv ilə başlayır), amma hələ heç bir yerdə oxunub tətbiq edilmir.

## Baxılan alternativlər

- **JWT** — rədd edildi: özündə-tam (self-contained) token-lər logout/revoke zamanı əlavə bir denylist cədvəli tələb edərdi; sxem artıq `token_hash` sütunu ilə DB-də saxlanılan opaque token formasını nəzərdə tuturdu.
- **Identity üçün də `events` cədvəli** — rədd edildi: "UserRegistered", "SessionCreated" kimi event-ləri replay etməyin heç bir praktik faydası yoxdur (auth state-i idempotent CRUD-dur, agregasiya lazım deyil); əksinə, gələcək Ledger event sxemi ilə qarışdırıla bilərdi.
- **Native `bcrypt`** — rədd edilmədi prinsipcə, sadəcə indi seçilmədi: pnpm-in native build-approval gate-i ilə bu layihədə artıq bir neçə dəfə (`@scarf/scarf`, `esbuild`) üzləşmişik, `bcryptjs` bunu tamamilə keçib gedir. MVP trafikində fərq yoxdur; performans problem olsa, `bcryptjs`→`bcrypt` keçidi asandır (interfeys eynidir).
- **Login zamanı granular scope yoxlaması** — rədd edildi: `docs/decisions/0003-mvp-scope.md` bunu artıq sonraya saxlayıb, real command-lar (Ledger) mövcud olmayana qədər yoxlanacaq bir şey yoxdur.

## Nəticələr

- Parol sıfırlama və hesab deaktivasiyası/məlumat silinməsi bu addımda tətbiq olunmadı — `docs/PROGRESS.md`-də ayrıca addım kimi qeyd olunub.
- Gələcəkdə real command-lar (Ledger və s.) yazılanda, `SessionAuthGuard`-ın üzərinə `clients.scopes`-u oxuyan bir permission qatı əlavə olunmalıdır — indi bu qat yoxdur, yalnız "token keçərlidirmi" yoxlanılır.
- `sessions.token_hash` üzərində unique constraint yoxdur (sxem dəyişməyib) — kolliziya nəzəri olaraq mümkündür (SHA-256, praktik olaraq əhəmiyyətsiz), amma bunu bilərəkdən qeyd edirik ki, gələcəkdə unikallıq lazım olarsa yada düşsün.
