import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

const BASIC_CSV = [
  'Tarix,Təyinat,Məbləğ,Komissiya,Balans',
  '01-01-2026 10:00:00,Uber,-5.00,0,95.00',
  '01-01-2026 11:00:00,MilliÖn,100,0,195.00',
  '01-01-2026 12:00:00,Xəzinəyə köçürmə,-10,0,185.00',
].join('\n');

const MISMATCHED_CSV = [
  'Tarix,Təyinat,Məbləğ,Komissiya,Balans',
  '02-01-2026 10:00:00,Uber,-5.00,0,95.00',
  '02-01-2026 11:00:00,MilliÖn,100,0,999.00',
].join('\n');

const LEARNABLE_CSV = [
  'Tarix,Təyinat,Məbləğ,Komissiya,Balans',
  '03-01-2026 09:00:00,MyLocalCafeXYZ,-8.00,0,92.00',
].join('\n');

describe('Statement Import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  let accountId: string;
  let transportCategoryId: string;
  let internalExpenseCategoryId: string;
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
      .send({ name: 'Leobank', type: 'bank', currency: 'AZN' })
      .expect(201);
    accountId = account.body.id;

    const categories = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', auth())
      .expect(200);
    transportCategoryId = categories.body.find(
      (c: { name: string; kind: string }) => c.name === 'Nəqliyyat' && c.kind === 'expense',
    ).id;
    internalExpenseCategoryId = categories.body.find(
      (c: { name: string; kind: string }) => c.name === 'Daxili köçürmə' && c.kind === 'expense',
    ).id;
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('previews a CSV: direction, category suggestion, internal-transfer detection', async () => {
    const res = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(BASIC_CSV, 'utf-8'), 'statement.csv')
      .expect(201);

    expect(res.body.totalRows).toBe(3);
    expect(res.body.duplicateCount).toBe(0);
    expect(res.body.balanceMismatchCount).toBe(0);

    const [uberRow, incomeRow, internalRow] = res.body.rows;
    expect(uberRow.direction).toBe('debit');
    expect(uberRow.amount).toBe('5');
    expect(uberRow.suggestedCategoryId).toBe(transportCategoryId);
    expect(uberRow.isInternalTransfer).toBe(false);

    expect(incomeRow.direction).toBe('credit');
    expect(incomeRow.suggestedCategoryId).toBeNull();

    expect(internalRow.isInternalTransfer).toBe(true);
    expect(internalRow.suggestedCategoryId).toBe(internalExpenseCategoryId);
  });

  it('flags a balance-chain mismatch', async () => {
    const res = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(MISMATCHED_CSV, 'utf-8'), 'statement.csv')
      .expect(201);

    expect(res.body.balanceMismatchCount).toBe(1);
    expect(res.body.rows[1].balanceMismatch).toBe(true);
  });

  it('commits previewed rows and is idempotent on re-commit', async () => {
    const preview = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(BASIC_CSV, 'utf-8'), 'statement.csv')
      .expect(201);

    const rows = preview.body.rows.map((row: Record<string, unknown>) => ({
      fingerprint: row.fingerprint,
      occurredAt: row.occurredAt,
      amount: row.amount,
      direction: row.direction,
      categoryId: row.suggestedCategoryId ?? undefined,
      note: row.description,
      include: true,
    }));

    const commit = await request(app.getHttpServer())
      .post('/statement-import/commit')
      .set('Authorization', auth())
      .send({ accountId, rows })
      .expect(201);
    expect(commit.body).toEqual({ imported: 3, skippedDuplicates: 0, excluded: 0 });

    const entries = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(entries.body).toHaveLength(3);

    // Eyni faylı ikinci dəfə preview edəndə hamısı dublikat kimi işarələnməlidir.
    const secondPreview = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(BASIC_CSV, 'utf-8'), 'statement.csv')
      .expect(201);
    expect(secondPreview.body.duplicateCount).toBe(3);

    // Eyni sətirləri ikinci dəfə commit etmək yeni sətir yaratmamalıdır (externalRef idempotency).
    const secondCommit = await request(app.getHttpServer())
      .post('/statement-import/commit')
      .set('Authorization', auth())
      .send({ accountId, rows })
      .expect(201);
    expect(secondCommit.body).toEqual({ imported: 0, skippedDuplicates: 3, excluded: 0 });

    const entriesAfter = await request(app.getHttpServer())
      .get(`/ledger/entries?accountId=${accountId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(entriesAfter.body).toHaveLength(3);
  });

  it('learns a per-user category rule on commit and keeps it isolated from other users', async () => {
    const firstPreview = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(LEARNABLE_CSV, 'utf-8'), 'statement.csv')
      .expect(201);
    expect(firstPreview.body.rows[0].suggestedCategoryId).toBeNull();

    await request(app.getHttpServer())
      .post('/statement-import/commit')
      .set('Authorization', auth())
      .send({
        accountId,
        rows: [
          {
            fingerprint: firstPreview.body.rows[0].fingerprint,
            occurredAt: firstPreview.body.rows[0].occurredAt,
            amount: firstPreview.body.rows[0].amount,
            direction: firstPreview.body.rows[0].direction,
            categoryId: transportCategoryId,
            note: firstPreview.body.rows[0].description,
            include: true,
            saveRuleKeyword: 'MyLocalCafeXYZ',
          },
        ],
      })
      .expect(201);

    // Eyni istifadəçi eyni tacir adını yenidən görəndə (fərqli, təkrar-olmayan sətirdə) artıq təklif olunmalıdır.
    const secondCsv = LEARNABLE_CSV.replace('03-01-2026 09:00:00', '04-01-2026 09:00:00').replace('92.00', '84.00');
    const learnedPreview = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(secondCsv, 'utf-8'), 'statement.csv')
      .expect(201);
    expect(learnedPreview.body.rows[0].suggestedCategoryId).toBe(transportCategoryId);

    // Başqa istifadəçi eyni tacir adını görəndə öyrənilmiş qayda görünməməlidir (izolyasiya).
    const other = await registerAndLogin(app, { baseCurrency: 'AZN' });
    const otherAccount = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(other.accessToken))
      .send({ name: 'Digər istifadəçinin hesabı', type: 'bank', currency: 'AZN' })
      .expect(201);

    const otherPreview = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', bearer(other.accessToken))
      .field('accountId', otherAccount.body.id)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(LEARNABLE_CSV, 'utf-8'), 'statement.csv')
      .expect(201);
    expect(otherPreview.body.rows[0].suggestedCategoryId).toBeNull();

    await cleanupTestUser(prisma, other.email);
  });

  it('rejects preview for an account that does not belong to the caller', async () => {
    const other = await registerAndLogin(app, { baseCurrency: 'AZN' });
    const otherAccount = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(other.accessToken))
      .send({ name: 'Başqasının hesabı', type: 'cash', currency: 'AZN' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', otherAccount.body.id)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(BASIC_CSV, 'utf-8'), 'statement.csv')
      .expect(404);

    await cleanupTestUser(prisma, other.email);
  });
});
