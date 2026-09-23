import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { FrankfurterClient, type FrankfurterRate } from './../src/modules/currency-fx/frankfurter-client.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

const FAKE_SYNC_DATE = '2020-06-15';
const fakeRates: Record<string, number> = { ZZA: 10, ZZB: 20, AZN: 1.7, USD: 1, EUR: 0.9 };

describe('Currency & FX (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FrankfurterClient)
      .useValue({
        getRates: async (base: string, quotes: string[]): Promise<FrankfurterRate[]> =>
          quotes
            .filter((quote) => quote in fakeRates)
            .map((quote) => ({ date: FAKE_SYNC_DATE, base, quote, rate: fakeRates[quote] })),
      })
      .compile();

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

  describe('gündəlik sync (POST /fx-rates/sync)', () => {
    let syncSession: TestSession;

    beforeAll(async () => {
      syncSession = await registerAndLogin(app, { baseCurrency: 'ZZB' });
      await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', bearer(syncSession.accessToken))
        .send({ name: 'Sync test hesabı', type: 'cash', currency: 'ZZA' })
        .expect(201);
    });

    afterAll(async () => {
      await prisma.fxRate.deleteMany({ where: { rateDate: new Date(FAKE_SYNC_DATE) } });
      await cleanupTestUser(prisma, syncSession.email);
    });

    it('syncs direct rates for every currency currently in use, in both directions', async () => {
      await request(app.getHttpServer())
        .post('/fx-rates/sync')
        .set('Authorization', bearer(syncSession.accessToken))
        .expect(200);

      const forward = await prisma.fxRate.findUnique({
        where: {
          baseCurrency_quoteCurrency_rateDate: {
            baseCurrency: 'ZZA',
            quoteCurrency: 'ZZB',
            rateDate: new Date(FAKE_SYNC_DATE),
          },
        },
      });
      const backward = await prisma.fxRate.findUnique({
        where: {
          baseCurrency_quoteCurrency_rateDate: {
            baseCurrency: 'ZZB',
            quoteCurrency: 'ZZA',
            rateDate: new Date(FAKE_SYNC_DATE),
          },
        },
      });

      expect(forward).not.toBeNull();
      expect(backward).not.toBeNull();
      expect(Number(forward!.rate)).toBeCloseTo(fakeRates.ZZB);
      expect(Number(backward!.rate)).toBeCloseTo(fakeRates.ZZA);
      expect(forward!.source).toBe('frankfurter');
    });
  });
});
