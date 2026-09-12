# ADR-0006: Backend stack — NestJS + PostgreSQL + Prisma

Tarix: 2026-09-12
Status: accepted

## Kontekst

Core API-ni hansı dil/framework, DB və ORM ilə qurmaq lazımdır ki, ADR-0001-dəki Command → Event → Projection memarlığına rahat oturuşsun.

## Qərar

Backend NestJS (TypeScript) ilə qurulur. DB PostgreSQL, ORM Prisma. Command/event dispatch üçün `@nestjs/cqrs` modulu istifadə olunur (`CommandBus`/`CommandHandler`, `EventBus`/`EventHandler`) — bu, ADR-0001-dəki memarlığı NestJS-in öz idiomlarında ifadə edir.

**Vacib nüans:** `@nestjs/cqrs`-in `EventBus`-u yalnız proses-daxili (in-memory) dispatch-dir, event-i özü saxlamır/persist etmir. `events` cədvəlinə yazma məsuliyyəti bizim event handler-lərimizdədir — bunu Prisma `$transaction` daxilində, command handler-in özündə edirik ki, event və projeksiya yazısı atomik olsun (bax `.claude/rules/database.md`).

Hər konseptual modul (`docs/MODULES.md`-dəki) öz NestJS modulu kimi təşkil olunur (`src/modules/<module-name>/`).

## Baxılan alternativlər

- **Xüsusi xarici event-sourcing kitabxanası/servisi** — hələlik rədd edildi: `@nestjs/cqrs` + öz Prisma transaksiyamız MVP üçün kifayətdir, əlavə infrastruktur asılılığı indi lazım deyil.
- **TypeORM, Prisma yerinə** — rədd edildi: Prisma-nın tip təhlükəsizliyi və migration axını üstünlük təşkil etdi (istifadəçinin öz seçimi).

## Nəticələr

- Yeni command yazanda: NestJS `CommandHandler` + öz event-persistence kodumuz birlikdə yazılmalıdır — təkcə CQRS decorator-larına etibar etmək kifayət deyil, `events`-ə yazmağı unutmaq asan bir səhvdir.
- Prisma migration-ları `events`/`ledger_entries` kimi əsas, append-only cədvəllərdə diqqətlə aparılmalıdır — bax `.claude/rules/database.md`.
- Hələ açıq qalan qərarlar: monorepo strategiyası, API üslubu (REST/GraphQL), paket meneceri, mobil/veb frontend seçimi — bax `docs/PROGRESS.md`.
