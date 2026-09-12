# ADR-0008: NestJS modul qovluqlarının adlandırılması

Tarix: 2026-09-12
Status: accepted

## Kontekst

`.claude/rules/architecture.md` hər konseptual modulun (`docs/MODULES.md`-dəki) öz NestJS modulu olmasını tələb edir (`src/modules/<ad>/`), nümunə olaraq `ledger`, `accounts` göstərir. Amma `docs/MODULES.md`-dəki bəzi modul adları çox sözlüdür ("Identity & Access", "Currency & FX", "Net Worth & Reporting", "Budget & Rules") — bunları birbaşa qovluq adına çevirmək lazım idi.

Həmçinin: `docs/MODULES.md` §9 "AI Assistant"-i ayrıca modul kimi yox, `clients.type='ai_chat'` olan bir client kimi təsvir edir — deməli onun `src/modules/`-da öz qovluğu olmamalıdır.

## Qərar

Qovluq adları qısa, tək/cüt sözdən ibarət kebab-case formada, əsas ismi saxlayıb təsviri sözü atır:

| `docs/MODULES.md` başlığı | `src/modules/` qovluğu |
|---|---|
| Identity & Access | `identity` |
| Accounts | `accounts` |
| Ledger | `ledger` |
| Categories | `categories` |
| Currency & FX | `currency-fx` |
| Net Worth & Reporting | `net-worth` |
| Budget & Rules | `budget` |
| Goals | `goals` |

**AI Assistant üçün qovluq yaradılmır** — bu, yeni qərar deyil, `docs/MODULES.md` §9-da artıq yazılmış faktın kodda əks olunmasıdır.

Paylaşılan Prisma provider (`PrismaService`/`PrismaModule`) `src/prisma/`-dadır, `src/modules/`-dan kənarda — o, konseptual bir modul deyil, bütün modulların istifadə etdiyi infrastruktur təbəqəsidir.

## Baxılan alternativlər

- **Tam adlar** (`identity-access`, `net-worth-reporting`, `budget-rules`) — rədd edildi: daha açıq, amma import yollarını uzadır; `docs/MODULES.md`-in özü modulun nə etdiyini izah edir, qovluq adının bunu təkrarlamasına ehtiyac yoxdur.

## Nəticələr

- Yeni modul əlavə edəndə eyni qaydanı tətbiq et: əsas ismi saxla, təsviri sözü at.
- `docs/MODULES.md`-dəki başlıq ilə `src/modules/`-dəki qovluq adı arasındakı uyğunluq yalnız bu cədvəldə yazılıdır — başlığı oxuyub qovluğu təxmin etmə, bura bax.
