/**
 * Bir dəfəlik miqrasiya: köhnə qlobal (user_id IS NULL) kateqoriyaları və təklif qaydalarını
 * mövcud hər istifadəçiyə məxsus şəxsi kopyalara çevirir (bax docs/decisions/0018-per-user-categories.md).
 * İdempotentdir — artıq şəxsi kopyası olan istifadəçi/açar-söz cütü üçün təkrar yaratmır.
 *
 * İşlətmək: node --experimental-strip-types scripts/migrate-categories-to-per-user.ts
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const users = await client.query('SELECT id FROM users');
  const globalCategories = await client.query(
    'SELECT id, name, kind, icon FROM categories WHERE user_id IS NULL',
  );
  const globalRules = await client.query(
    `SELECT r.keyword, c.name AS category_name, c.kind AS category_kind
     FROM category_suggestion_rules r JOIN categories c ON r.category_id = c.id
     WHERE r.user_id IS NULL`,
  );

  let clonedCategories = 0;
  let clonedRules = 0;
  let repointedEntries = 0;

  for (const user of users.rows) {
    const userId = user.id as string;

    const cloneIdByNameAndKind = new Map<string, string>();
    for (const category of globalCategories.rows) {
      const existing = await client.query(
        'SELECT id FROM categories WHERE user_id = $1 AND name = $2 AND kind = $3',
        [userId, category.name, category.kind],
      );
      let cloneId: string;
      if (existing.rowCount) {
        cloneId = existing.rows[0].id as string;
      } else {
        cloneId = randomUUID();
        await client.query(
          'INSERT INTO categories (id, user_id, parent_id, name, kind, icon) VALUES ($1, $2, NULL, $3, $4, $5)',
          [cloneId, userId, category.name, category.kind, category.icon],
        );
        clonedCategories++;
      }
      cloneIdByNameAndKind.set(`${category.name}|${category.kind}`, cloneId);

      // Bu istifadəçinin (ledger_entries varsa) köhnə qlobal kateqoriyaya olan istinadlarını yeni kopyaya keçir.
      const repointed = await client.query(
        `UPDATE ledger_entries SET category_id = $1
         WHERE category_id = $2 AND account_id IN (SELECT id FROM accounts WHERE user_id = $3)`,
        [cloneId, category.id, userId],
      );
      repointedEntries += repointed.rowCount ?? 0;
    }

    for (const rule of globalRules.rows) {
      const categoryId = cloneIdByNameAndKind.get(`${rule.category_name}|${rule.category_kind}`);
      if (!categoryId) continue;

      const existingRule = await client.query(
        'SELECT id FROM category_suggestion_rules WHERE user_id = $1 AND keyword = $2',
        [userId, rule.keyword],
      );
      if (existingRule.rowCount) continue;

      await client.query(
        'INSERT INTO category_suggestion_rules (id, user_id, keyword, category_id) VALUES ($1, $2, $3, $4)',
        [randomUUID(), userId, rule.keyword, categoryId],
      );
      clonedRules++;
    }
  }

  const deletedRules = await client.query(
    'DELETE FROM category_suggestion_rules WHERE user_id IS NULL',
  );
  const deletedCategories = await client.query('DELETE FROM categories WHERE user_id IS NULL');

  await client.end();

  console.log(`İstifadəçilər: ${users.rows.length}`);
  console.log(`Klonlanmış kateqoriyalar: ${clonedCategories}`);
  console.log(`Klonlanmış qaydalar: ${clonedRules}`);
  console.log(`Yenidən yönləndirilmiş ledger_entries: ${repointedEntries}`);
  console.log(`Silinmiş qlobal qaydalar: ${deletedRules.rowCount}`);
  console.log(`Silinmiş qlobal kateqoriyalar: ${deletedCategories.rowCount}`);
}

await main();
