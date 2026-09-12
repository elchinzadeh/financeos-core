# ADR-0001: Bütün mutasiyalar üçün event-sourced command layer

Tarix: 2026-09-12
Status: accepted

## Kontekst

Platformaya bir neçə client qoşulacaq: mobil app, veb app, AI chat, gələcəkdə MCP (istifadəçinin öz LLM-i) və bank/fintech sync. Bunların hamısı eyni maliyyə datasını dəyişəcək. Tələblər:
- Hər dəyişikliyin audit trail-i olmalıdır (kim, nə vaxt, hansı client ilə)
- İstənilən tarixə "restore" mümkün olmalıdır
- Yeni client (MCP, OCR, bank sync) əlavə etmək əsas modulları yenidən yazmağı tələb etməməlidir

## Qərar

Bütün state-dəyişdirən əməliyyatlar core API-də **command**-lardır. Hər command bir **event** yaradır (`events` cədvəli, append-only). Balanslar, hesabatlar, net worth — hamısı bu event-lərdən hesablanan **projeksiyalardır**, öz başına "həqiqət mənbəyi" deyil.

Tam infrastruktur (Kafka/EventStore) əvəzinə: Postgres üzərində `events` cədvəli + eyni DB transaksiyası daxilində işləyən projector funksiyaları. MVP üçün kifayətdir, yük artanda async worker-ə keçmək mümkündür.

## Baxılan alternativlər

- **Hər client öz CRUD-unu edir, ortaq command layer yoxdur** — rədd edildi: məntiq təkrarlanır, audit trail yoxdur, yeni client əlavə etmək hər dəfə yeni yazma yolu deməkdir.
- **Tam CQRS + xarici event store (Kafka/EventStore) MVP-dən** — rədd edildi: MVP üçün həddindən artıq infrastruktur; Postgres-in özü kifayət qədər güclüdür, sonra miqrasiya mümkündür.

## Nəticələr

- Yeni client (MCP, bank sync, OCR) əlavə etmək = mövcud command-ları çağırmaq, yeni yazma yolu yox.
- Amma: hər yeni command üçün həm event həm də onu emal edən projector yazılmalıdır — bir addım əlavə iş, lakin uzunmüddətli konsistentlik üçün dəyər.
- Balans kimi "sadə" sorğular da əslində agregasiyadır — performans üçün cache (`account_balances`) lazımdır, amma bu cache həmişə `events`-dən yenidən qurula bilməlidir.
