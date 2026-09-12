# ADR-0007: Repo strukturu, API üslubu və paket meneceri

Tarix: 2026-09-12
Status: accepted

## Kontekst

ADR-0006 backend stack-i (NestJS + PostgreSQL + Prisma) qərarlaşdırdı, amma repo strukturu, API üslubu və paket meneceri açıq saxlanmışdı.

## Qərar

- **Repo strukturu:** sadə tək NestJS repo. Monorepo tooling (Nx/Turborepo) indi qurulmur.
- **API üslubu:** REST + OpenAPI (Swagger). NestJS-in `@nestjs/swagger` modulu ilə hər endpoint sənədləşdirilir.
- **Paket meneceri:** pnpm.

## Baxılan alternativlər

- **Monorepo (Nx/Turborepo) indi qurmaq** — rədd edildi: hazırda tək bir servis (core API) var, MCP server və paylaşılan paketlər hələ mövcud deyil; erkən monorepo mürəkkəbliyi əsassız yükdür. MCP server ayrı servis kimi qurulanda yenidən qiymətləndiriləcək.
- **GraphQL / REST+GraphQL hibrid** — rədd edildi: developer API-nin geniş, tanış və sənədləşməsi asan olması üstünlük təşkil etdi. REST+OpenAPI həm insan developer-lər, həm gələcək MCP tool generasiyası üçün əlverişlidir (OpenAPI sxemindən MCP tool-ları generasiya etmək mümkündür).
- **npm/yarn** — istifadəçinin öz seçimi ilə pnpm seçildi.

## Nəticələr

- Hər endpoint `@nestjs/swagger` decorator-ları ilə sənədləşdirilməlidir — bu, sonra MCP server qurulanda OpenAPI sxemindən tool generasiyasını asanlaşdıracaq.
- Bundan sonrakı bütün komanda nümunələri `pnpm ...` formatındadır (məs. `pnpm test`, `pnpm prisma migrate dev`).
- Monorepo-ya keçid lazım olsa (MCP server ayrı servis kimi qurulanda), bu ADR "superseded" ediləcək.
