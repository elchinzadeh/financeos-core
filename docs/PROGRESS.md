# Progress

Bu fayl status lövhəsidir, changelog deyil (dəyişikliklərin tarixçəsi üçün git-ə bax). Mənalı bir iş bitəndə, ya da scope-a dair qərar veriləndə bu faylı yenilə. Qısa yaz — bir sətir kifayətdir, detal lazımdırsa ADR-ə keçid ver.

## Modul statusu

| Modul | Status | Qeyd |
|---|---|---|
| Identity & Access | Tətbiq olundu (register/login/logout/me) | `src/modules/identity/` — `SessionAuthGuard`, opaque hash-lənmiş sessiya token-i (bax `docs/decisions/0009-identity-auth-strategy.md`). Parol sıfırlama və hesab deaktivasiyası hələ yoxdur |
| Accounts | Skeleton + sxem hazır | `src/modules/accounts/` boş modul, `prisma/schema.prisma`-da `accounts` — command/endpoint hələ yoxdur |
| Ledger | Başlanmayıb | Core — əvvəl bunu qur |
| Categories | Başlanmayıb | |
| Currency & FX | Başlanmayıb | |
| Net Worth & Reporting | Başlanmayıb | |
| Budget & Rules (yalnız şablonlar) | Başlanmayıb | |
| Goals (statik məbləğ) | Başlanmayıb | |
| AI Assistant (chat client) | Başlanmayıb | |

## Növbəti addımlar

- [x] Backend stack seçildi: NestJS + PostgreSQL + Prisma, `@nestjs/cqrs` (bax `docs/decisions/0006-backend-stack.md`)
- [x] Repo strukturu, API üslubu, paket meneceri seçildi: tək repo, REST+OpenAPI, pnpm (bax `docs/decisions/0007-repo-api-tooling.md`)
- [x] `pnpm` ilə NestJS layihəsini scaffold et, Prisma + Swagger modullarını qur (bax `docs/decisions/0008-module-folder-naming.md`)
- [ ] Mobil/veb frontend seçimini müəyyənləşdir
- [x] Identity & Access-i tətbiq et (bax `docs/decisions/0009-identity-auth-strategy.md`)
- [ ] Accounts + Ledger-i birgə tətbiq et (Ledger, Accounts-un mövcud olmasını tələb edir)
- [ ] Parol sıfırlama axını (email göndərmə infrastrukturu tələb edir — hələ yoxdur)
- [ ] Hesab deaktivasiyası / məlumatların silinməsi (GDPR-tipli, diqqətli dizayn tələb edir)

## Log

*(ən yenisi əvvəldə — sessiya/qərar başına bir sətir, aidiyyatı olan ADR-ə keçid ver)*

- Identity & Access tətbiq olundu: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; opaque + SHA-256 hash-lənmiş sessiya token-ləri, `bcryptjs` ilə parol hashing, `SessionAuthGuard` (bax `docs/decisions/0009-identity-auth-strategy.md`). Parol sıfırlama və hesab deaktivasiyası bilərəkdən kənarda saxlanıldı.
- NestJS layihəsi scaffold edildi (Nest 12, ESM, `pnpm`), Prisma 7 (driver adapter — `@prisma/adapter-pg`) və `@nestjs/swagger` quruldu; `prisma/schema.prisma`-da Identity & Access + Accounts cədvəlləri yazıldı və `financeos_dev`-ə migrate edildi; 8 modul üçün boş skeleton yaradıldı (bax `docs/decisions/0008-module-folder-naming.md`). Server boot və Swagger UI (`/api`) yoxlanıldı.
- Repo strukturu (tək repo), API üslubu (REST+OpenAPI) və paket meneceri (pnpm) qərarlaşdırıldı (bax `docs/decisions/0007-repo-api-tooling.md`).
- Backend stack qərarı verildi: NestJS + PostgreSQL + Prisma, `@nestjs/cqrs` command/event dispatch üçün (bax `docs/decisions/0006-backend-stack.md`).
- Layihə başladı: memarlıq (Command→Event→Projection), MVP scope və DB sxemi müəyyənləşdirildi (bax `docs/decisions/0001`–`0004`). Kod hələ yazılmayıb.
