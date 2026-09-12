import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Accounts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    session = await registerAndLogin(app);
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('opens a new account', async () => {
    const res = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Nağd pul', type: 'cash', currency: 'AZN' })
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.isActive).toBe(true);
    expect(res.body.currency).toBe('AZN');
  });

  it('lists only active accounts by default', async () => {
    const opened = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Arxivlənəcək', type: 'cash', currency: 'AZN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounts/${opened.body.id}/archive`)
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(list.body.find((a: { id: string }) => a.id === opened.body.id)).toBeUndefined();

    const listAll = await request(app.getHttpServer())
      .get('/accounts?includeArchived=true')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(listAll.body.find((a: { id: string }) => a.id === opened.body.id)).toBeTruthy();
  });

  it('returns an account with its balance', async () => {
    const opened = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Balanslı hesab', type: 'bank', currency: 'AZN' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/accounts/${opened.body.id}`)
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(res.body.balance).toBe('0');
  });

  it('rejects a ledger command against an archived account', async () => {
    const opened = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Arxivlənəcək 2', type: 'cash', currency: 'AZN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounts/${opened.body.id}/archive`)
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', bearer(session.accessToken))
      .send({ accountId: opened.body.id, amount: '10.00' })
      .expect(400);
  });
});
