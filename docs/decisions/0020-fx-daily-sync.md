# ADR-0020: Currency & FX — gündəlik avtomatik kurs sinxronizasiyası (frankfurter.dev)

Tarix: 2026-09-23
Status: accepted

## Kontekst

`docs/PROGRESS.md`-də uzun müddət açıq qalan bloklanmış maddə: "Currency & FX: xarici mənbədən gündəlik avtomatik kurs yeniləmə (cron) — bloklanıb: real FX API açarı lazımdır". İstifadəçi ilə frankfurter.dev araşdırıldı: **v1** (`api.frankfurter.dev/v1`, ECB-yalnız mənbə, ~30 valyuta) AZN-i dəstəkləmir — bu layihə üçün istifadəyə yararsızdır, çünki `users.base_currency` və `accounts.currency`-nin default/nümunə dəyəri AZN-dir. **v2** (`api.frankfurter.dev/v2`, 98 mərkəzi bank/rəsmi mənbədən, 164 valyuta) AZN daxildir və açar tələb etmir.

## Qərar

1. **`src/modules/currency-fx/frankfurter-client.ts`** — `FrankfurterClient.getRates(base, quotes)` frankfurter v2-yə nazik təbəqədir. `EmailService`-dəki nümunə ilə eyni məqsədlə ayrıca inject-lənən class-dır: testlərdə `overrideProvider` ilə əvəz oluna bilsin deyə (bax `docs/decisions/0019-email-infrastructure.md`).
   - **Diqqət**: real API cavabı ilkin təxmin edilən `{date, rates: {...}}` formasında **deyil** — `[{date, base, quote, rate}, ...]` massividir, hər sətir öz `date`-inə malikdir (bəzi az-likvid valyutalar üçün əvvəlki iş günü tarixi ola bilər). Bu, canlı `curl` ilə yoxlanılaraq üzə çıxarıldı (əvvəlcə sənədləşmə xülasəsinə əsaslanan fərziyyə yalnış çıxdı) — kodda buna uyğun düzəldildi.
   - `quotes` parametri (`?quotes=USD,EUR`, cəm, `quote` tək deyil — bu da sınaqla tapıldı, sənədləşmədə açıq deyildi) sorğunu yalnız lazım olan valyutalarla məhdudlaşdırır, 164 valyutanın hamısını çəkməyin qarşısını alır.

2. **"İstifadədə olan valyutalar" strategiyası** (`FxSyncService.getCurrenciesInUse()`): valyuta kodu sistemdə sərbəst mətndir (enum yoxdur), ona görə əvvəlcədən sabit siyahı təyin etmək mümkün deyil. Hər sinxronizasiyada `accounts.currency` ∪ `users.base_currency` ∪ `goals.target_currency`-nin unikal birləşməsi çıxarılır (boşdursa — tam təzə DB — `['AZN','USD','EUR']` default dəsti işlədilir). Bu siyahıdakı hər valyuta `base` kimi, qalanı `quotes` kimi bir sorğuda çağırılır — N valyuta üçün N sorğu, hər cüt **hər iki istiqamətdə düz** yazılır (`getRate()`-in tərs-fallback-ına ehtiyac qalmır, mövcud fallback ehtiyat olaraq qalır). Bütün 164 valyutanı yükləyib saxlamaq əvəzinə, yalnız real istifadədə olanlar saxlanılır.

3. **Xəta idarəsi — `EmailService`-dəki "heç vaxt atmır" fəlsəfəsinin eynisi, hər valyuta üçün ayrıca izolə olunmuş**: hər `base` üçün sorğu öz `try/catch`-i daxilindədir — biri uğursuz olsa (şəbəkə, frankfurter tərəfi), `Logger.error` ilə loglanır, digər valyutalar davam edir. `onModuleInit()`-də də eyni tutulur — frankfurter əlçatan olmasa belə server boot-u bloklanmır.

4. **`@nestjs/schedule`** əlavə olundu (`ScheduleModule.forRoot()` → `AppModule`), `@Cron(CronExpression.EVERY_DAY_AT_6AM)` gündəlik tetiklənir. Əlavə olaraq `FxSyncService implements OnModuleInit` — server açılanda dərhal bir sinxronizasiya edir ki, təzə deploy-da cron-un ilk işə düşməsini gözləməyə ehtiyac olmasın.

5. **`POST /fx-rates/sync`** (mövcud `SessionAuthGuard` altında, ayrıca admin rolu bu layihədə yoxdur) — cron-u gözləmədən dərhal tetiklənməsi üçün əl ilə endpoint. Testdə də bunun üzərindən sınanılır (cron cədvəlini gözləmək əvəzinə).

## Baxılan alternativlər

- **Bütün 164 valyutanı hər gün çəkib saxlamaq** — rədd edildi: lazımsız yer və sorğu sayı, praktik olaraq istifadə olunmayan valyutalar üçün.
- **Triangulyasiya (üçüncü valyuta, məs. USD üzərindən) əlavə etmək `getRate()`-ə** — rədd edildi bu PR-da: mövcud düz+tərs-fallback dizaynına toxunmadan, "istifadədə olan valyutalar" strategiyası hər cütü birbaşa yazdığı üçün triangulyasiyaya ehtiyac qalmır. Gələcəkdə çox sayda az-işlənən valyuta cütü olsa yenidən nəzərdən keçirilə bilər.
- **Tək bir sabit anchor valyuta (məs. yalnız `base=USD`) ilə gündə 1 sorğu** — rədd edildi: yalnız USD-ni əhatə edən cütləri örtürdü (`getRate` triangulyasiya etmədiyi üçün AZN↔EUR kimi USD-siz cütlər üçün işləməzdi).

## Nəticələr

- Yeni asılılıq: `@nestjs/schedule` (npm).
- `docs/PROGRESS.md`-dəki "Currency & FX: gündəlik avtomatik kurs yeniləmə — bloklanıb" maddəsi bağlandı.
- Canlı yoxlanıldı (izolə edilmiş dev instansiya, ayrıca port): `POST /fx-rates/sync` real frankfurter-ə qarşı çağırıldı, `AZN→USD` (0.58839) və `USD→AZN` (1.6996) sətirləri bugünkü tarixlə, `source='frankfurter'` ilə yarandı.
- Frontend-də dəyişiklik lazım deyil — `GET/POST /fx-rates` formatı dəyişmir, `financeos-web`-in Settings səhifəsi olduğu kimi işləyir.
