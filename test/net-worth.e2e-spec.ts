import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Net Worth & Reporting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  let accountA: string;
  let accountB: string;
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

    const a = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name: 'Kassa', type: 'cash', currency: 'AZN' })
      .expect(201);
    accountA = a.body.id;

    const b = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name: 'GBP kart', type: 'card', currency: 'GBP' })
      .expect(201);
    accountB = b.body.id;

    // Fərqli valyuta cütü istifadə olunur ki, ledger.e2e-spec.ts-in USD/AZN kursu ilə paralel
    // işə düşəndə eyni fx_rates sətrini yaratma/silmə üstündə yarış (race) olmasın.
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', auth())
      .send({ baseCurrency: 'GBP', quoteCurrency: 'AZN', rate: '1.7' })
      .expect(201);

    const categories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    const expenseCategory = categories.body.find((c: { kind: string }) => c.kind === 'expense');
    const incomeCategory = categories.body.find((c: { kind: string }) => c.kind === 'income');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId: accountA, amount: '1000.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId: accountA, amount: '200.00', categoryId: expenseCategory.id })
      .expect(201);
    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId: accountB, amount: '50.00', categoryId: incomeCategory.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounts/${accountB}/archive`)
      .set('Authorization', auth())
      .expect(200);
  });

  afterAll(async () => {
    await prisma.fxRate.deleteMany({ where: { baseCurrency: 'GBP', quoteCurrency: 'AZN' } });
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('includes archived accounts in current net worth, converted to base currency', async () => {
    const res = await request(app.getHttpServer())
      .get('/net-worth')
      .set('Authorization', auth())
      .expect(200);

    expect(Number(res.body.total)).toBeCloseTo(885); // 800 AZN + 50*1.7 AZN
    const bRow = res.body.accounts.find((a: { accountId: string }) => a.accountId === accountB);
    expect(bRow).toBeTruthy();
    expect(Number(bRow.convertedBalance)).toBeCloseTo(85);
  });

  it('returns zero net worth for a date before any transactions existed', async () => {
    const asOf = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/net-worth?asOf=${encodeURIComponent(asOf)}`)
      .set('Authorization', auth())
      .expect(200);

    expect(Number(res.body.total)).toBeCloseTo(0);
  });

  it('groups the category summary and sums frozen base-currency values', async () => {
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await request(app.getHttpServer())
      .get(`/net-worth/category-summary?from=${from}&to=${to}`)
      .set('Authorization', auth())
      .expect(200);

    const uncategorized = res.body.find((c: { categoryId: null }) => c.categoryId === null);
    expect(Number(uncategorized.total)).toBeCloseTo(1000);

    const expenseRow = res.body.find((c: { kind: string }) => c.kind === 'expense');
    expect(Number(expenseRow.total)).toBeCloseTo(-200);

    const incomeRow = res.body.find(
      (c: { kind: string; categoryId: string | null }) => c.kind === 'income' && c.categoryId !== null,
    );
    expect(Number(incomeRow.total)).toBeCloseTo(85);
  });

  it('returns one point for a single-day timeline', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/net-worth/timeline?from=${today}&to=${today}&interval=day`)
      .set('Authorization', auth())
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].netWorth)).toBeCloseTo(885);
  });

  it('rejects a timeline range wider than the point cap', async () => {
    await request(app.getHttpServer())
      .get('/net-worth/timeline?from=2000-01-01&to=2026-01-01&interval=day')
      .set('Authorization', auth())
      .expect(400);
  });
});
