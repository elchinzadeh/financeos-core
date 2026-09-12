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

  await client.end();
  console.log(`Seeded ${inserted} new default categories (${DEFAULT_CATEGORIES.length} total, idempotent).`);
}

await main();
