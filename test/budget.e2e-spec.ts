import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Budget & Rules (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
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
  });

  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: session.userId } });
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('lists the two hardcoded templates', async () => {
    const res = await request(app.getHttpServer())
      .get('/budgets/templates')
      .set('Authorization', auth())
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((t: { id: string }) => t.id)).toEqual(
      expect.arrayContaining(['50-30-20', '70-20-10']),
    );
  });

  it('rejects an allocation pointing at an income-kind category', async () => {
    const categories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    const incomeCategory = categories.body.find((c: { kind: string }) => c.kind === 'income');

    await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', auth())
      .send({
        name: 'Səhv büdcə',
        source: 'custom',
        allocations: [{ categoryId: incomeCategory.id, percent: 50 }],
        priority: 1,
        activeFrom: '2000-01-01',
      })
      .expect(400);
  });

  it('checks actual spend against income-based limits and flags a breach', async () => {
    const account = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name: 'Büdcə hesabı', type: 'cash', currency: 'AZN' })
      .expect(201);
    const accountId = account.body.id;

    const categories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    const food = categories.body.find((c: { name: string }) => c.name === 'Yemək');
    const transport = categories.body.find((c: { name: string }) => c.name === 'Nəqliyyat');

    const budget = await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', auth())
      .send({
        name: '50/30/20 test',
        source: 'template',
        templateId: '50-30-20',
        allocations: [
          { categoryId: food.id, percent: 50 },
          { categoryId: transport.id, percent: 30 },
        ],
        priority: 1,
        activeFrom: '2000-01-01',
      })
      .expect(201);

    // Dövr gəliri: 1000 AZN. Limitlər: Yemək=500, Nəqliyyat=300.
    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '1000.00' })
      .expect(201);
    // Yemək: limitdən az (400 < 500)
    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount: '400.00', categoryId: food.id })
      .expect(201);
    // Nəqliyyat: limiti aşır (350 > 300)
    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount: '350.00', categoryId: transport.id })
      .expect(201);

    const check = await request(app.getHttpServer())
      .get(`/budgets/${budget.body.id}/check`)
      .set('Authorization', auth())
      .expect(200);

    expect(Number(check.body.totalIncome)).toBeCloseTo(1000);
    const foodCheck = check.body.allocations.find((a: { categoryId: string }) => a.categoryId === food.id);
    const transportCheck = check.body.allocations.find(
      (a: { categoryId: string }) => a.categoryId === transport.id,
    );
    expect(Number(foodCheck.limit)).toBeCloseTo(500);
    expect(Number(foodCheck.actual)).toBeCloseTo(400);
    expect(foodCheck.breached).toBe(false);
    expect(Number(transportCheck.limit)).toBeCloseTo(300);
    expect(Number(transportCheck.actual)).toBeCloseTo(350);
    expect(transportCheck.breached).toBe(true);

    // Geri qaytarma: xərc kateqoriyası ilə gəlir (credit) həmin kateqoriyanın xərcini azaldır, gəlir sayılmır (ADR-0022).
    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '100.00', categoryId: transport.id })
      .expect(201);
    const afterRefund = await request(app.getHttpServer())
      .get(`/budgets/${budget.body.id}/check`)
      .set('Authorization', auth())
      .expect(200);
    expect(Number(afterRefund.body.totalIncome)).toBeCloseTo(1000);
    const transportAfter = afterRefund.body.allocations.find(
      (a: { categoryId: string }) => a.categoryId === transport.id,
    );
    expect(Number(transportAfter.actual)).toBeCloseTo(250);
    expect(transportAfter.breached).toBe(false);

    const reprioritized = await request(app.getHttpServer())
      .post(`/budgets/${budget.body.id}/priority`)
      .set('Authorization', auth())
      .send({ priority: 5 })
      .expect(201);
    expect(reprioritized.body.priority).toBe(5);

    const deactivated = await request(app.getHttpServer())
      .post(`/budgets/${budget.body.id}/deactivate`)
      .set('Authorization', auth())
      .expect(201);
    expect(deactivated.body.activeTo).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/budgets/${budget.body.id}/deactivate`)
      .set('Authorization', auth())
      .expect(400);
  });
});
