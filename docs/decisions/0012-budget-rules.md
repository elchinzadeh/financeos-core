# ADR-0012: Budget & Rules — percent semantikası, statik şablonlar

Tarix: 2026-09-12
Status: accepted

## Kontekst

`docs/MODULES.md` §7-də `definition.allocations[].percent`-in NƏYİN faizi olduğu açıq deyildi (yalnız `{category_id, percent}` forması yazılıb). Bu, istifadəçidən aydınlaşdırıldı.

## Qərar

1. **`percent` dövr üzrə ümumi gəlirin faizidir** (klassik 50/30/20 oxunuşu): `limit = dövrdəki_gəlir × percent/100`. Gəlir dövrdən-dövrə dəyişəndə limit avtomatik uyğunlaşır, sabit ədəd deyil.
2. **Şablonlar (`50/30/20`, `70/20/10`) kod-səviyyəli statik konstantalardır** (`budget.constants.ts`), DB-də saxlanmır. `GET /budgets/templates` UI-ya bucket adı+faiz təklifi vermək üçündür; real büdcə yaradanda istifadəçi öz kateqoriyalarını `{categoryId, percent}` cütləri kimi verir — `templateId` sadəcə istinad üçün `source: 'template'` ilə birgə saxlanılır (əslində istifadə olunmur).
3. **Allocation-lar yalnız `expense`-kind kateqoriyalara işarə edə bilər** — limit anlayışı xərcə aiddir, `CategoriesService.getAccessibleCategory(...,'expense')` ilə yoxlanılır. Faizlərin cəmi 100-dən çox ola bilməz.
4. **`goals`/`accounts` kimi `budgets` də protected cədvəldir** — `CreateBudget`/`UpdateBudgetPriority`/`DeactivateBudget` `@nestjs/cqrs` command-ları ilə, `$transaction` daxilində `events` + `budgets` yazır.
5. **`check` sorğusu büdcənin öz `active_from`/`active_to` pəncərəsini istifadə edir** (`active_to` yoxdursa/gələcəkdirsə bugünə — günün SONUNA — qədər). Gəlir və xərc Net Worth-un kateqoriya hesabatı ilə eyni məntiqlə (donmuş `fx_rate_to_base`, bax `docs/decisions/0011-net-worth-fx-strategy.md`) baza valyutada cəmlənir.

## Baxılan alternativlər

- **Sabit hədəf məbləğ** (`percent` əvəzinə/əlavə `amount`) — istifadəçi tərəfindən rədd edildi: gəlir-nisbi limit 50/30/20-nin bütün mənasıdır.
- **Şablonları DB-də saxlamaq** (`budget_templates` cədvəli) — rədd edildi: MVP-də cəmi 2-3 sabit şablon var, ADR-0003-ə görə builder gələnə qədər DB-yə çıxarmağa ehtiyac yoxdur.

## Nəticələr

- Gələcək rule builder `definition` formasını (`allocations: [{category_id, percent}]`) dəyişmədən eyni cür yazacaq (ADR-0003-ün tələbi).
- `check` performansı Net Worth-dakı kimi hər sorğuda `ledger_entries`-i JS-də cəmləyir (agregat sorğu deyil) — böyük tarixçəli istifadəçilərdə gələcək optimallaşdırma tələb edə bilər.
