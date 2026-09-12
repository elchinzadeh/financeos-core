# ADR-0014: CORS-un aktivləşdirilməsi (veb client üçün)

Tarix: 2026-09-12
Status: accepted

## Kontekst

Core API-yə ilk dəfə bir brauzer-əsaslı client (`financeos-web`, ayrıca repo, Next.js) qoşulur. Frontend-in framework/repo/auth seçimi öz repo-sunun qərarıdır (bax `financeos-web/docs/decisions/0001-frontend-foundation.md`) — bu ADR yalnız o seçimin **bu repo-da** tələb etdiyi yeganə dəyişikliyi sənədləşdirir.

Frontend Bearer token auth istifadə edir, backend-in `Authorization` header mexanizmini dəyişmir. Amma bu, kifayət deyil: brauzer dev-server-i (`:3001`) fərqli portdan olduğu üçün, `Authorization` header daşıyan cross-origin sorğu CORS icazəsi olmadan brauzer tərəfindən bloklanır — bu, auth strategiyasından asılı olmayan brauzer təhlükəsizlik qaydasıdır.

## Qərar

`src/main.ts`-də `NestFactory.create()`-dan sonra:

```ts
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3001'],
  credentials: false,
});
```

- `CORS_ORIGIN` env dəyişəni ilə icazəli origin-lər production-da konfiqurasiya olunur (vergüllə ayrılmış siyahı); verilməzsə yalnız frontend-in dev-server portu (`:3001`) icazəlidir.
- `credentials: false` — cookie/sessiya `credentials` daşınmır (auth Bearer header ilədir, bax `financeos-web` ADR-0001), bu da CORS konfiqurasiyasını sadələşdirir (wildcard origin-lə uzlaşan `credentials:true` təhlükəsini aradan qaldırır).
- Endpoint-lər, DTO-lar, auth axını — heç biri dəyişmir.

## Baxılan alternativlər

- **Proxy vasitəsilə (Next.js `rewrites`) same-origin kimi göstərmək, CORS-a ehtiyac qalmasın** — rədd edildi: dev zamanı əlavə mürəkkəblik, production-da fərqli deploy topologiyası (ayrı domain/subdomain) ehtimalı ilə uzlaşmır; birbaşa CORS daha şəffafdır.
- **`origin: '*'`** — rədd edildi: lazımsız geniş icazə, gələcək client-lər (mobile) bu icazəyə ehtiyac duymur (onlar brauzer CORS qaydasına tabe deyil).

## Nəticələr

- Yeni client origin əlavə etmək (məs. production domain) `CORS_ORIGIN` env dəyişənini yeniləməklə olur, kod dəyişikliyi tələb etmir.
- Frontend-in özünə aid bütün digər qərarlar (stack, auth saxlanması, data-fetching) `financeos-web` repo-sunun öz `docs/decisions/`-ində qalır — bu ADR onları təkrarlamır.
