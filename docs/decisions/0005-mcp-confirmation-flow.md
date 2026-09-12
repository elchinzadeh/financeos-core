# ADR-0005: MCP write-access üçün propose/confirm axını (planlaşdırılıb, MVP-də tətbiq olunmur)

Tarix: 2026-09-12
Status: proposed — MVP-dən kənardır (bax ADR-0003)

## Kontekst

İstifadəçi öz LLM-ini (Claude, ChatGPT və s.) MCP vasitəsilə platformaya qoşacaq, həm oxuma həm yazma icazəsi ilə. MCP protokolunun "elicitation" mexanizmi server-in tool icrasını dayandırıb istifadəçidən təsdiq istəməsinə imkan verir, amma bunu bütün MCP client-lər dəstəkləmir. Buna görə confirmation-ı tam client-in "yaxşı davranışına" güvənərək qurmaq olmaz.

## Qərar (tətbiq ediləndə)

Riskli command-lar iki mərhələyə bölünür: `proposeX` (qısa ömürlü, imzalanmış pending-action ID qaytarır) və `confirmX` (yalnız bu ID ilə icra edir). Elicitation dəstəkləyən client-lərdə təsdiq elə oradaca alınır; dəstəkləməyənlərdə mobil app-a push bildiriş fallback kimi işləyir. Hər təsdiqlənmiş əməliyyat hansı client/session tərəfindən təsdiqləndiyini `events.client_id`-də saxlayır (bax ADR-0001).

## Baxılan alternativlər

- **Yalnız MCP elicitation-a güvənmək** — rədd edildi: bütün client-lər dəstəkləmir, server-in özü müstəqil qorunma tələb edir.
- **Confirmation olmadan, LLM-ə tam etibar etmək** — rədd edildi: LLM səhv/"hallucinate" edə bilər, maliyyə datası üçün qəbuledilməzdir.

## Nəticələr

- Bu, MVP-də tətbiq olunmur (bax ADR-0003) — çünki confirmation infrastrukturu core API sabitləşmədən qurulsa, əlavə mürəkkəblik yaradır.
- Tətbiq ediləndə: `docs/MODULES.md`-ə yeni sahələr (pending action cədvəli) əlavə olunmalı, bu ADR "accepted" statusuna keçirilməli və detallı sxem yazılmalıdır.
