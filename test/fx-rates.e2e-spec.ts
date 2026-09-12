import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Currency & FX (e2e)', () => {
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
    await prisma.fxRate.deleteMany({ where: { baseCurrency: 'ZZA' } });
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('upserts a daily rate and can query it back', async () => {
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', bearer(session.accessToken))
      .send({ baseCurrency: 'ZZA', quoteCurrency: 'ZZB', rate: '2.5', rateDate: '2020-01-01' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/fx-rates?base=ZZA&quote=ZZB')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].rate)).toBeCloseTo(2.5);
  });

  it('updates the same day rate in place on a second upsert', async () => {
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', bearer(session.accessToken))
      .send({ baseCurrency: 'ZZA', quoteCurrency: 'ZZB', rate: '3.0', rateDate: '2020-01-01' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/fx-rates?base=ZZA&quote=ZZB')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].rate)).toBeCloseTo(3.0);
  });
});
