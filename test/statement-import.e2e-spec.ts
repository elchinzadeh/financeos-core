import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureBodyParsers } from './../src/app.setup.js';
import { JevChoiceAnswer, JevChoiceQuestion, JevClient } from './../src/modules/jev/jev.client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

/**
 * Real Jev API-sinə çıxmamaq üçün əvəzləyici; hər testdə `answer`/`calls` sıfırlanır (bax ADR-0021).
 * İdxal bir sorğuda bir neçə qrup soruşur (hər biri ayrı sual): `answer.category` sorğudakı BÜTÜN suallara cavab verilir.
 */
const jevStub = {
  enabled: true,
  answer: null as Record<string, JevChoiceAnswer> | null,
  calls: [] as { state: unknown; questions: Record<string, JevChoiceQuestion> }[],
  isEnabled() {
    return this.enabled;
  },
  async choose(state: unknown, questions: Record<string, JevChoiceQuestion>) {
    this.calls.push({ state, questions });
    if (!this.answer) return null;
    const answer = this.answer.category;
    return Object.fromEntries(Object.keys(questions).map((name) => [name, answer]));
  },
};

const UNKNOWN_MERCHANT_CSV = [
  'Tarix,Təyinat,Məbləğ,Komissiya,Balans',
  '05-01-2026 09:00:00,ZzqUnknownShop,-12.00,0,88.00',
  '05-01-2026 10:00:00,ZzqUnknownShop,-3.00,0,85.00',
].join('\n');

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
    })
      .overrideProvider(JevClient)
      .useValue(jevStub)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureBodyParsers(app as NestExpressApplication);
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

  beforeEach(() => {
    jevStub.enabled = true;
    jevStub.answer = null;
    jevStub.calls = [];
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  async function previewCsv(csv: string) {
    const res = await request(app.getHttpServer())
      .post('/statement-import/preview')
      .set('Authorization', auth())
      .field('accountId', accountId)
      .field('bankProfile', 'leobank')
      .attach('file', Buffer.from(csv, 'utf-8'), 'statement.csv')
      .expect(201);
    return res.body;
  }

  async function foodCategoryId(): Promise<string> {
    const categories = await request(app.getHttpServer()).get('/categories').set('Authorization', auth()).expect(200);
    return categories.body.find((c: { name: string; kind: string }) => c.name === 'Yemək' && c.kind === 'expense').id;
  }

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

  describe('commit: transfers, refunds and large bodies (ADR-0022)', () => {
    async function openAccount(name: string, currency: string) {
      const res = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', auth())
        .send({ name, type: 'bank', currency })
        .expect(201);
      return res.body.id as string;
    }

    const commitRow = (fingerprint: string, direction: 'debit' | 'credit', extra: Record<string, unknown> = {}) => ({
      fingerprint,
      occurredAt: '2026-02-10T10:00:00.000Z',
      amount: '25.00',
      direction,
      note: 'Köçürmə testi',
      include: true,
      ...extra,
    });

    it('commits a row as a transfer between two accounts (both ledger entries) and is idempotent', async () => {
      const savingsId = await openAccount('Yığım hesabı', 'AZN');
      const send = () =>
        request(app.getHttpServer())
          .post('/statement-import/commit')
          .set('Authorization', auth())
          .send({
            accountId,
            rows: [
              commitRow('transfer-out-1', 'debit', { transferAccountId: savingsId }),
              commitRow('transfer-in-1', 'credit', { transferAccountId: savingsId }),
            ],
          });

      const first = await send().expect(201);
      expect(first.body).toEqual({ imported: 2, skippedDuplicates: 0, excluded: 0 });

      // debit: idxal hesabından yığıma; credit: yığımdan idxal hesabına — hər biri iki tərəfli (debit + credit) sətir.
      const main = await request(app.getHttpServer()).get(`/ledger/entries?accountId=${accountId}`).set('Authorization', auth()).expect(200);
      const savings = await request(app.getHttpServer()).get(`/ledger/entries?accountId=${savingsId}`).set('Authorization', auth()).expect(200);
      const mainOut = main.body.find((e: { externalRef: string }) => e.externalRef === 'transfer-out-1');
      const mainIn = main.body.find((e: { externalRef: string }) => e.externalRef === 'transfer-in-1');
      expect(mainOut.direction).toBe('debit');
      expect(mainIn.direction).toBe('credit');
      expect(savings.body).toHaveLength(2);
      expect(savings.body.map((e: { direction: string }) => e.direction).sort()).toEqual(['credit', 'debit']);
      // Hər köçürmənin iki sətri eyni transactionGroupId-dədir.
      for (const entry of [mainOut, mainIn]) {
        const partner = savings.body.find((e: { transactionGroupId: string }) => e.transactionGroupId === entry.transactionGroupId);
        expect(partner).toBeDefined();
        expect(partner.direction).not.toBe(entry.direction);
        expect(partner.categoryId).toBeNull();
      }

      const again = await send().expect(201);
      expect(again.body).toEqual({ imported: 0, skippedDuplicates: 2, excluded: 0 });
    });

    it('rejects transfer rows to the same account, a different currency, or combined with a category', async () => {
      const usdId = await openAccount('USD hesab', 'USD');
      const categories = await request(app.getHttpServer()).get('/categories').set('Authorization', auth()).expect(200);
      const someCategory = categories.body[0].id;
      const commit = (row: Record<string, unknown>) =>
        request(app.getHttpServer()).post('/statement-import/commit').set('Authorization', auth()).send({ accountId, rows: [row] });

      await commit(commitRow('bad-1', 'debit', { transferAccountId: accountId })).expect(400);
      await commit(commitRow('bad-2', 'debit', { transferAccountId: usdId })).expect(400);
      await commit(commitRow('bad-3', 'debit', { transferAccountId: usdId, categoryId: someCategory })).expect(400);
    });

    it('accepts an income row with an expense category (refund) through commit', async () => {
      const categories = await request(app.getHttpServer()).get('/categories').set('Authorization', auth()).expect(200);
      const expenseCategory = categories.body.find((c: { kind: string; name: string }) => c.kind === 'expense' && c.name === 'Yemək').id;

      await request(app.getHttpServer())
        .post('/statement-import/commit')
        .set('Authorization', auth())
        .send({ accountId, rows: [commitRow('refund-1', 'credit', { categoryId: expenseCategory })] })
        .expect(201);

      const entries = await request(app.getHttpServer()).get(`/ledger/entries?accountId=${accountId}`).set('Authorization', auth()).expect(200);
      const refund = entries.body.find((e: { externalRef: string }) => e.externalRef === 'refund-1');
      expect(refund.direction).toBe('credit');
      expect(refund.categoryId).toBe(expenseCategory);
    });

    it('accepts a commit body larger than the default 100 KB Express limit', async () => {
      const rows = Array.from({ length: 500 }, (_, i) =>
        commitRow(`bulk-${i}-${'x'.repeat(64)}`, 'debit', { note: `Toplu sətir ${i} ${'n'.repeat(200)}` }),
      );
      expect(JSON.stringify({ accountId, rows }).length).toBeGreaterThan(150_000);

      const res = await request(app.getHttpServer())
        .post('/statement-import/commit')
        .set('Authorization', auth())
        .send({ accountId, rows })
        .expect(201);
      expect(res.body.imported).toBe(500);
    }, 60_000);
  });

  describe('AI category suggestions (Jev, ADR-0021)', () => {
    it('fills the category from a confident Jev answer and marks the source as ai (one question per group)', async () => {
      const foodId = await foodCategoryId();
      jevStub.answer = { category: { choice: foodId, confidence: 0.93 } };

      const body = await previewCsv(UNKNOWN_MERCHANT_CSV);

      // Eyni tacirin iki sətri bir qrupdur → tək Jev sorğusunda tək sual, hər iki sətir doldurulur.
      expect(jevStub.calls).toHaveLength(1);
      expect(Object.keys(jevStub.calls[0].questions)).toHaveLength(1);
      expect(body.rows).toHaveLength(2);
      for (const row of body.rows) {
        expect(row.suggestedCategoryId).toBe(foodId);
        expect(row.suggestionSource).toBe('ai');
        expect(row.suggestionConfidence).toBe(0.93);
      }
    });

    it('offers only the user expense categories plus an explicit "none" option to Jev', async () => {
      jevStub.answer = null;
      await previewCsv(UNKNOWN_MERCHANT_CSV);

      const categories = await request(app.getHttpServer()).get('/categories').set('Authorization', auth()).expect(200);
      const options = Object.values(jevStub.calls[0].questions)[0].options;

      expect(options).toHaveProperty('__none__');
      const expenseIds = categories.body
        .filter((c: { kind: string; name: string }) => c.kind === 'expense' && c.name !== 'Daxili köçürmə')
        .map((c: { id: string }) => c.id);
      const incomeIds = categories.body.filter((c: { kind: string }) => c.kind === 'income').map((c: { id: string }) => c.id);
      expect(Object.keys(options).filter((k) => k !== '__none__').sort()).toEqual([...expenseIds].sort());
      for (const id of incomeIds) expect(options).not.toHaveProperty(id);
    });

    it('leaves the suggestion empty when Jev confidence is below the threshold', async () => {
      const foodId = await foodCategoryId();
      jevStub.answer = { category: { choice: foodId, confidence: 0.3 } };

      const body = await previewCsv(UNKNOWN_MERCHANT_CSV);

      expect(jevStub.calls).toHaveLength(1);
      for (const row of body.rows) {
        expect(row.suggestedCategoryId).toBeNull();
        expect(row.suggestionSource).toBeNull();
        expect(row.suggestionConfidence).toBeNull();
      }
    });

    it('leaves the suggestion empty when Jev says no category fits', async () => {
      jevStub.answer = { category: { choice: '__none__', confidence: 0.99 } };

      const body = await previewCsv(UNKNOWN_MERCHANT_CSV);

      for (const row of body.rows) {
        expect(row.suggestedCategoryId).toBeNull();
        expect(row.suggestionSource).toBeNull();
      }
    });

    it('still returns a normal preview when Jev fails or is not configured', async () => {
      jevStub.answer = null; // Jev xətası best-effort olaraq null-a çevrilir
      const failed = await previewCsv(UNKNOWN_MERCHANT_CSV);
      expect(failed.totalRows).toBe(2);
      expect(failed.rows[0].suggestedCategoryId).toBeNull();

      jevStub.enabled = false;
      const disabled = await previewCsv(UNKNOWN_MERCHANT_CSV);
      expect(disabled.rows[0].suggestedCategoryId).toBeNull();
      // Uğursuz sorğu 1 + 3 retry = 4 çağırış; söndürülmüş Jev üçün heç nə əlavə olunmur.
      expect(jevStub.calls).toHaveLength(4);
    });

    it('asks about many groups in a few batched requests, most frequent merchants first', async () => {
      const foodId = await foodCategoryId();
      jevStub.answer = { category: { choice: foodId, confidence: 0.9 } };
      const rare = Array.from({ length: 30 }, (_, i) => `07-01-2026 10:00:00,ZzqRare${i},-1.00,0,99.00`);
      const frequent = Array.from({ length: 5 }, () => '07-01-2026 11:00:00,ZzqFrequentShop,-2.00,0,98.00');
      const body = await previewCsv(['Tarix,Təyinat,Məbləğ,Komissiya,Balans', ...rare, ...frequent].join('\n'));

      // 31 qrup, batch başına 6 → 6 sorğu (31 ayrı sorğu yox); ən çox sətirli qrup ilk batch-ın ilk sualıdır.
      expect(jevStub.calls).toHaveLength(6);
      expect(String(jevStub.calls[0].state)).toContain('1. ZzqFrequentShop');
      expect(body.rows.every((row: { suggestionSource: string | null }) => row.suggestionSource === 'ai')).toBe(true);
    });

    it('stops calling Jev after consecutive failed batches instead of retrying every group', async () => {
      jevStub.answer = null; // hər sorğu uğursuz (rate limit / outage)
      const groups = Array.from({ length: 60 }, (_, i) => `07-01-2026 10:00:00,ZzqUnknownShop${i},-1.00,0,99.00`);
      const body = await previewCsv(['Tarix,Təyinat,Məbləğ,Komissiya,Balans', ...groups].join('\n'));

      expect(body.totalRows).toBe(60);
      expect(body.rows.every((row: { suggestedCategoryId: string | null }) => row.suggestedCategoryId === null)).toBe(true);
      // 60 qrup = 10 batch; hər biri 4 cəhd olsa 40 çağırış olardı. 3 ardıcıl uğursuz batch-dan sonra dayanır.
      expect(jevStub.calls.length).toBeLessThan(40);
      expect(jevStub.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('does not send masked card-to-card transfers to Jev', async () => {
      jevStub.answer = { category: { choice: '__none__', confidence: 0.9 } };
      const csv = ['Tarix,Təyinat,Məbləğ,Komissiya,Balans', '08-01-2026 10:00:00,552209****8061,-30.00,0,70.00', '08-01-2026 11:00:00,ZzqUnknownShop,-5.00,0,65.00'].join('\n');
      await previewCsv(csv);

      expect(jevStub.calls).toHaveLength(1);
      expect(String(jevStub.calls[0].state)).toContain('ZzqUnknownShop');
      expect(String(jevStub.calls[0].state)).not.toContain('552209');
    });

    it('does not call Jev for rows already matched by a rule or detected as an internal transfer', async () => {
      jevStub.answer = { category: { choice: '__none__', confidence: 0.9 } }; // uğurlu cavab → retry yoxdur
      const body = await previewCsv(BASIC_CSV.replaceAll('01-01-2026', '06-01-2026'));

      const [uberRow, incomeRow, internalRow] = body.rows;
      expect(uberRow.suggestionSource).toBe('rule');
      expect(internalRow.suggestionSource).toBe('internal_transfer');
      expect(incomeRow.suggestionSource).toBeNull();
      // Yalnız qayda tapılmayan gəlir sətri üçün çağırış olmalıdır (Uber/daxili köçürmə üçün yox).
      expect(jevStub.calls).toHaveLength(1);
      expect(String(jevStub.calls[0].state)).toContain('MilliÖn | gəlir');
    });

    it('never writes anything during preview, even when AI suggests a category', async () => {
      const foodId = await foodCategoryId();
      jevStub.answer = { category: { choice: foodId, confidence: 0.95 } };
      const eventsBefore = await prisma.event.count({ where: { userId: session.userId } });

      await previewCsv(UNKNOWN_MERCHANT_CSV);

      expect(await prisma.event.count({ where: { userId: session.userId } })).toBe(eventsBefore);
    });
  });
});
