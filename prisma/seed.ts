/**
 * Kateqoriyalar artıq qlobal seed-lə deyil, hər istifadəçi qeydiyyatdan keçəndə
 * `IdentityService.register()` tərəfindən ona məxsus nümunə olaraq yaradılır
 * (bax docs/decisions/0018-per-user-categories.md). Bu skript indi heç nə etmir —
 * `prisma migrate reset` kimi alətlərin çağırdığı `prisma.seed` konfiqurasiyası üçün saxlanılıb.
 */
async function main() {
  console.log('Seed addımı yoxdur — kateqoriyalar qeydiyyat zamanı istifadəçiyə məxsus yaradılır.');
}

await main();
