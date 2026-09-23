import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Ledger (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  const auth = () => bearer(session.accessToken);

  async function openAccount(name: string, type: string, currency: string) {
    const res = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name, type, currency })
      .expect(201);
    return res.body.id as string;
  }

  async function getBalance(accountId: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    return Number(res.body.balance);
  }

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
    await prisma.fxRate.deleteMany({ where: { baseCurrency: 'USD', quoteCurrency: 'AZN' } });
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('replays income + expense into the correct final balance', async () => {
    const accountId = await openAccount('Əsas kassa', 'cash', 'AZN');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '1000.00' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount: '250.50' })
      .expect(201);

    expect(await getBalance(accountId)).toBeCloseTo(749.5);
  });

  it('rejects an expense with an income-kind category', async () => {
    const accountId = await openAccount('Kateqoriya testi', 'cash', 'AZN');
    const categories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    const incomeCategory = categories.body.find((c: { kind: string }) => c.kind === 'income');

    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount: '10.00', categoryId: incomeCategory.id })
      .expect(400);
  });

  it('transfers between two same-currency accounts and checks both entries and both balances', async () => {
    const fromId = await openAccount('Transfer mənbə', 'bank', 'AZN');
    const toId = await openAccount('Transfer hədəf', 'bank', 'AZN');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId: fromId, amount: '500.00' })
      .expect(201);

    const transfer = await request(app.getHttpServer())
      .post('/ledger/transfer')
      .set('Authorization', auth())
      .send({ fromAccountId: fromId, toAccountId: toId, amount: '200.00' })
      .expect(201);

    expect(transfer.body).toHaveLength(2);
    const debitEntry = transfer.body.find((e: { direction: string }) => e.direction === 'debit');
    const creditEntry = transfer.body.find((e: { direction: string }) => e.direction === 'credit');
    expect(debitEntry.accountId).toBe(fromId);
    expect(Number(debitEntry.amount)).toBeCloseTo(200);
    expect(creditEntry.accountId).toBe(toId);
    expect(Number(creditEntry.amount)).toBeCloseTo(200);

    expect(await getBalance(fromId)).toBeCloseTo(300);
    expect(await getBalance(toId)).toBeCloseTo(200);
  });

  it('transfers across currencies using the inverse-rate fallback', async () => {
    // Yalnız USD->AZN kursu seed edilir; AZN->USD üçün tərs kurs istifadə olunmalıdır.
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', auth())
      .send({ baseCurrency: 'USD', quoteCurrency: 'AZN', rate: '1.7' })
      .expect(201);

    const fromId = await openAccount('AZN mənbə', 'bank', 'AZN');
    const toId = await openAccount('USD hədəf', 'bank', 'USD');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId: fromId, amount: '100.00' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ledger/transfer')
      .set('Authorization', auth())
      .send({ fromAccountId: fromId, toAccountId: toId, amount: '17.00' })
      .expect(201);

    expect(await getBalance(fromId)).toBeCloseTo(83);
    expect(await getBalance(toId)).toBeCloseTo(10);
  });

  it('adjusts a balance up and down', async () => {
    const accountId = await openAccount('Reconciliation', 'cash', 'AZN');

    await request(app.getHttpServer())
      .post('/ledger/adjust-balance')
      .set('Authorization', auth())
      .send({ accountId, delta: '20.00' })
      .expect(201);
    expect(await getBalance(accountId)).toBeCloseTo(20);

    await request(app.getHttpServer())
      .post('/ledger/adjust-balance')
      .set('Authorization', auth())
      .send({ accountId, delta: '-8.00' })
      .expect(201);
    expect(await getBalance(accountId)).toBeCloseTo(12);
  });

  it('rejects a command when no FX rate exists for the account currency', async () => {
    const accountId = await openAccount('JPY hesabı', 'bank', 'JPY');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '1000' })
      .expect(404);
  });

  it('freezes fx_rate_to_base on the entry even if the rate is corrected afterwards', async () => {
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', auth())
      .send({ baseCurrency: 'USD', quoteCurrency: 'AZN', rate: '1.7', rateDate: '2024-01-15' })
      .expect(201);

    const accountId = await openAccount('Tarixi USD hesab', 'bank', 'USD');
    const income = await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '100.00', occurredAt: '2024-01-15T00:00:00.000Z' })
      .expect(201);

    expect(Number(income.body.fxRateToBase)).toBeCloseTo(1.7);

    // Eyni tarix üçün kursu "düzəldirik" - köhnə sətrə təsir etməməlidir.
    await request(app.getHttpServer())
      .post('/fx-rates')
      .set('Authorization', auth())
      .send({ baseCurrency: 'USD', quoteCurrency: 'AZN', rate: '2.0', rateDate: '2024-01-15' })
      .expect(201);

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: income.body.id } });
    expect(entry.fxRateToBase.toNumber()).toBeCloseTo(1.7);
  });

  it('reconciles a corrupted balance cache back to the ledger_entries sum', async () => {
    const accountId = await openAccount('Reconcile testi', 'cash', 'AZN');

    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', auth())
      .send({ accountId, amount: '300.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/ledger/record-expense')
      .set('Authorization', auth())
      .send({ accountId, amount: '50.00' })
      .expect(201);

    // Cache-i qəsdən korlayırıq (real balans 250 olmalıdır).
    await prisma.accountBalance.update({
      where: { accountId },
      data: { balance: '999999' },
    });
    expect(await getBalance(accountId)).toBeCloseTo(999999);

    const result = await request(app.getHttpServer())
      .post('/ledger/reconcile')
      .set('Authorization', auth())
      .send({ accountId })
      .expect(201);

    expect(result.body).toHaveLength(1);
    expect(Number(result.body[0].newBalance)).toBeCloseTo(250);
    expect(result.body[0].corrected).toBe(true);
    expect(await getBalance(accountId)).toBeCloseTo(250);
  });

  it('rejects reconciling an account that does not belong to the caller', async () => {
    const other = await registerAndLogin(app, { baseCurrency: 'AZN' });
    const otherAccount = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(other.accessToken))
      .send({ name: 'Başqasının hesabı', type: 'cash', currency: 'AZN' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ledger/reconcile')
      .set('Authorization', auth())
      .send({ accountId: otherAccount.body.id })
      .expect(404);

    await cleanupTestUser(prisma, other.email);
  });
});
