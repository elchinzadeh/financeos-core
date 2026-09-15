import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const DEFAULT_CATEGORIES: { name: string; kind: 'income' | 'expense'; icon: string }[] = [
  { name: 'Maaş', kind: 'income', icon: '💼' },
  { name: 'Freelance', kind: 'income', icon: '💻' },
  { name: 'Digər gəlir', kind: 'income', icon: '➕' },
  { name: 'Yemək', kind: 'expense', icon: '🍽️' },
  { name: 'Nəqliyyat', kind: 'expense', icon: '🚗' },
  { name: 'Kommunal', kind: 'expense', icon: '🏠' },
  { name: 'Əyləncə', kind: 'expense', icon: '🎮' },
  { name: 'Digər xərc', kind: 'expense', icon: '➖' },
  { name: 'Daxili köçürmə', kind: 'income', icon: '🔁' },
  { name: 'Daxili köçürmə', kind: 'expense', icon: '🔁' },
];

/**
 * Bank çıxarışı idxalında satıcı adına görə kateqoriya təklifi (docs/decisions/0016-bank-statement-import.md).
 * Yalnız birmənalı, aydın tanınan adlar — qeyri-müəyyən sətirlər kateqoriyasız qalıb istifadəçiyə buraxılır.
 */
const CATEGORY_SUGGESTION_RULES: { keyword: string; categoryName: string; categoryKind: 'income' | 'expense' }[] = [
  { keyword: 'Uber', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Bolt Food', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Bolt', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Wolt', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Araz Supermarket', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Bravo', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Spar', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Socar Petrol', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Azpetrol', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'TP METRO', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'TP BUS', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'AzParking', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'ADY railway', categoryName: 'Nəqliyyat', categoryKind: 'expense' },
  { keyword: 'Azərişıq', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Azəriqaz', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Bakcell', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Azercell', categoryName: 'Kommunal', categoryKind: 'expense' },
  { keyword: 'Gloria Jeans', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'Costa Coffee', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'McDonalds', categoryName: 'Yemək', categoryKind: 'expense' },
  { keyword: 'KFC', categoryName: 'Yemək', categoryKind: 'expense' },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let inserted = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const existing = await client.query(
      'SELECT id FROM categories WHERE user_id IS NULL AND name = $1 AND kind = $2',
      [category.name, category.kind],
    );
    if (existing.rowCount) continue;

    await client.query(
      'INSERT INTO categories (id, user_id, parent_id, name, kind, icon) VALUES ($1, NULL, NULL, $2, $3, $4)',
      [randomUUID(), category.name, category.kind, category.icon],
    );
    inserted++;
  }

  let rulesInserted = 0;
  for (const rule of CATEGORY_SUGGESTION_RULES) {
    const category = await client.query(
      'SELECT id FROM categories WHERE user_id IS NULL AND name = $1 AND kind = $2',
      [rule.categoryName, rule.categoryKind],
    );
    if (!category.rowCount) continue;
    const categoryId = category.rows[0].id as string;

    const existingRule = await client.query(
      'SELECT id FROM category_suggestion_rules WHERE keyword = $1 AND category_id = $2',
      [rule.keyword, categoryId],
    );
    if (existingRule.rowCount) continue;

    await client.query(
      'INSERT INTO category_suggestion_rules (id, keyword, category_id) VALUES ($1, $2, $3)',
      [randomUUID(), rule.keyword, categoryId],
    );
    rulesInserted++;
  }

  await client.end();
  console.log(`Seeded ${inserted} new default categories (${DEFAULT_CATEGORIES.length} total, idempotent).`);
  console.log(
    `Seeded ${rulesInserted} new category suggestion rules (${CATEGORY_SUGGESTION_RULES.length} total, idempotent).`,
  );
}

await main();
