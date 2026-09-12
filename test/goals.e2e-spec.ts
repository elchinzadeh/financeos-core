import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Goals (e2e)', () => {
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
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('computes progress from the linked account balance', async () => {
    const account = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name: 'Ehtiyat hesabı', type: 'savings', currency: 'AZN' })
      .expect(201);

    const goal = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', auth())
      .send({
        name: 'Ehtiyat fond',
        targetAmount: '1000.00',
        targetCurrency: 'AZN',
        linkedAccountId: account.body.id,
      })
      .expect(201);

    expect(goal.body.progress.currentAmount).toBe('0');
    expect(goal.body.progress.percent).toBe(0);

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId: account.body.id, amount: '250.00' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/goals/${goal.body.id}`)
      .set('Authorization', auth())
      .expect(200);

    expect(Number(res.body.progress.currentAmount)).toBeCloseTo(250);
    expect(res.body.progress.percent).toBeCloseTo(25);
  });

  it('returns null progress when there is no linked account', async () => {
    const goal = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', auth())
      .send({ name: 'Bağlı olmayan hədəf', targetAmount: '500.00', targetCurrency: 'AZN' })
      .expect(201);

    expect(goal.body.progress.currentAmount).toBeNull();
    expect(goal.body.progress.percent).toBeNull();
  });

  it('completes a goal and rejects a second status transition', async () => {
    const goal = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', auth())
      .send({ name: 'Tamamlanacaq', targetAmount: '100.00', targetCurrency: 'AZN' })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/goals/${goal.body.id}/complete`)
      .set('Authorization', auth())
      .expect(201);
    expect(completed.body.status).toBe('completed');

    await request(app.getHttpServer())
      .post(`/goals/${goal.body.id}/complete`)
      .set('Authorization', auth())
      .expect(400);
    await request(app.getHttpServer())
      .post(`/goals/${goal.body.id}/abandon`)
      .set('Authorization', auth())
      .expect(400);
  });

  it('abandons an active goal', async () => {
    const goal = await request(app.getHttpServer())
      .post('/goals')
      .set('Authorization', auth())
      .send({ name: 'İmtina ediləcək', targetAmount: '100.00', targetCurrency: 'AZN' })
      .expect(201);

    const abandoned = await request(app.getHttpServer())
      .post(`/goals/${goal.body.id}/abandon`)
      .set('Authorization', auth())
      .expect(201);
    expect(abandoned.body.status).toBe('abandoned');
  });
});
