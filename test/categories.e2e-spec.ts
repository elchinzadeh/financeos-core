import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  let accountId: string;
  const auth = () => bearer(session.accessToken);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    session = await registerAndLogin(app, { baseCurrency: 'AZN' });

    const account = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name: 'Nağd pul', type: 'cash', currency: 'AZN' })
      .expect(201);
    accountId = account.body.id;
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  async function createCategory(name: string, kind: 'income' | 'expense' = 'expense', parentId?: string) {
    const res = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', auth())
      .send({ name, kind, ...(parentId ? { parentId } : {}) })
      .expect(201);
    return res.body as { id: string; userId: string; kind: string; parentId: string | null };
  }

  async function recordExpense(categoryId: string, amount: string) {
    const res = await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount, categoryId })
      .expect(201);
    return res.body;
  }

  it('qeydiyyatda hər istifadəçiyə öz nümunə kateqoriyaları yaradılır (sistem kateqoriyası yoxdur)', async () => {
    const res = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((c: { userId: string | null }) => c.userId === session.userId)).toBe(true);
    expect(res.body.some((c: { name: string }) => c.name === 'Yemək')).toBe(true);
  });

  it('creates and lists a user-owned category', async () => {
    const created = await createCategory('Kitablar');
    expect(created.userId).toBe(session.userId);

    const list = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body.find((c: { id: string }) => c.id === created.id)).toBeTruthy();
  });

  it('updates a category name/icon/parent, blocks a cycle', async () => {
    const parent = await createCategory('Ev xərcləri');
    const child = await createCategory('Kommunal xərc', 'expense', parent.id);

    const renamed = await request(app.getHttpServer())
      .patch(`/categories/${child.id}`)
      .set('Authorization', auth())
      .send({ name: 'Kommunal', icon: '🏠' })
      .expect(200);
    expect(renamed.body.name).toBe('Kommunal');
    expect(renamed.body.icon).toBe('🏠');

    // parent-i child-ın öz nəvəsi etmək cəhdi (cycle) rədd olunmalıdır
    await request(app.getHttpServer())
      .patch(`/categories/${parent.id}`)
      .set('Authorization', auth())
      .send({ parentId: child.id })
      .expect(400);

    const cleared = await request(app.getHttpServer())
      .patch(`/categories/${child.id}`)
      .set('Authorization', auth())
      .send({ parentId: null })
      .expect(200);
    expect(cleared.body.parentId).toBeNull();
  });

  it('rejects update/delete of another user’s category (404)', async () => {
    const other = await registerAndLogin(app, { baseCurrency: 'AZN' });
    const otherCategories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', bearer(other.accessToken))
      .expect(200);
    const otherCategoryId = otherCategories.body[0].id;

    await request(app.getHttpServer())
      .patch(`/categories/${otherCategoryId}`)
      .set('Authorization', auth())
      .send({ name: 'Ələ keçirmə cəhdi' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/categories/${otherCategoryId}`)
      .set('Authorization', auth())
      .send({ strategy: 'uncategorize' })
      .expect(404);

    await cleanupTestUser(prisma, other.email);
  });

  it('blocks deleting a category that still has children', async () => {
    const parent = await createCategory('Valideyn-blok');
    await createCategory('Uşaq-blok', 'expense', parent.id);

    await request(app.getHttpServer())
      .delete(`/categories/${parent.id}`)
      .set('Authorization', auth())
      .send({ strategy: 'uncategorize' })
      .expect(400);
  });

  it('delete strategy=reassign moves ledger_entries to the target category', async () => {
    const from = await createCategory('Yenidən-təyin-mənbə');
    const to = await createCategory('Yenidən-təyin-hədəf');
    const entry = await recordExpense(from.id, '10.00');

    await request(app.getHttpServer())
      .delete(`/categories/${from.id}`)
      .set('Authorization', auth())
      .send({ strategy: 'reassign', targetCategoryId: to.id })
      .expect(200);

    const entries = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    const moved = entries.body.find((e: { id: string }) => e.id === entry.id);
    expect(moved.categoryId).toBe(to.id);

    await request(app.getHttpServer())
      .get(`/categories`)
      .set('Authorization', auth())
      .expect(200)
      .then((res) => {
        expect(res.body.find((c: { id: string }) => c.id === from.id)).toBeUndefined();
      });
  });

  it('delete strategy=uncategorize nulls categoryId on ledger_entries', async () => {
    const category = await createCategory('Kateqoriyasız-hədəf');
    const entry = await recordExpense(category.id, '5.00');

    await request(app.getHttpServer())
      .delete(`/categories/${category.id}`)
      .set('Authorization', auth())
      .send({ strategy: 'uncategorize' })
      .expect(200);

    const entries = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    const uncategorized = entries.body.find((e: { id: string }) => e.id === entry.id);
    expect(uncategorized.categoryId).toBeNull();
  });

  it('delete strategy=delete removes ledger_entries and recomputes the account balance', async () => {
    const category = await createCategory('Silinəcək-kateqoriya');
    const before = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    const entry = await recordExpense(category.id, '7.50');

    await request(app.getHttpServer())
      .delete(`/categories/${category.id}`)
      .set('Authorization', auth())
      .send({ strategy: 'delete' })
      .expect(200);

    const entries = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(entries.body.find((e: { id: string }) => e.id === entry.id)).toBeUndefined();

    const after = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.balance).toBe(before.body.balance);
  });

  it('delete strategy=archive hides the ledger_entries from listing and balance, keeps the row', async () => {
    const category = await createCategory('Arxivlənəcək-kateqoriya');
    const before = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    const entry = await recordExpense(category.id, '3.25');

    await request(app.getHttpServer())
      .delete(`/categories/${category.id}`)
      .set('Authorization', auth())
      .send({ strategy: 'archive' })
      .expect(200);

    const entries = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(entries.body.find((e: { id: string }) => e.id === entry.id)).toBeUndefined();

    const withArchived = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}&includeArchived=true`)
      .set('Authorization', auth())
      .expect(200);
    const archived = withArchived.body.find((e: { id: string }) => e.id === entry.id);
    expect(archived).toBeTruthy();
    expect(archived.categoryId).toBeNull();

    const after = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.balance).toBe(before.body.balance);
  });
});
