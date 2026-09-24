import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import {
  ClaudeExtractInput,
  ClaudeExtraction,
  ClaudeTransactionExtractor,
} from './../src/modules/assistant/claude-transaction-extractor.js';
import { JevChoiceAnswer, JevChoiceQuestion, JevClient } from './../src/modules/jev/jev.client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

/** Real Jev API-sinə çıxmamaq üçün əvəzləyici; hər testdə sıfırlanır (bax ADR-0021). */
const jevStub = {
  enabled: true,
  answer: null as Record<string, JevChoiceAnswer> | null,
  calls: [] as { state: unknown; questions: Record<string, JevChoiceQuestion> }[],
  isEnabled() {
    return this.enabled;
  },
  async choose(state: unknown, questions: Record<string, JevChoiceQuestion>) {
    this.calls.push({ state, questions });
    return this.answer;
  },
};

/** Real Anthropic API-sinə çıxmamaq üçün əvəzləyici; default olaraq söndürülüdür (Claude ehtiyatı yalnız açıq testlərdə). */
const claudeStub = {
  enabled: false,
  extraction: null as ClaudeExtraction | null,
  calls: [] as ClaudeExtractInput[],
  isEnabled() {
    return this.enabled;
  },
  async extract(input: ClaudeExtractInput) {
    this.calls.push(input);
    return this.extraction;
  },
};

describe('Assistant — parse-transaction (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  let cardAccountId: string;
  let cashAccountId: string;
  let usdAccountId: string;
  let foodCategoryId: string;
  let transportCategoryId: string;
  const auth = () => bearer(session.accessToken);

  const parse = (text: string) =>
    request(app.getHttpServer()).post('/assistant/parse-transaction').set('Authorization', auth()).send({ text });

  async function openAccount(name: string, type: string, currency: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', auth())
      .send({ name, type, currency })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JevClient)
      .useValue(jevStub)
      .overrideProvider(ClaudeTransactionExtractor)
      .useValue(claudeStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    session = await registerAndLogin(app, { baseCurrency: 'AZN' });

    cardAccountId = await openAccount('Kapital Kart', 'card', 'AZN');
    cashAccountId = await openAccount('Nağd pul', 'cash', 'AZN');
    usdAccountId = await openAccount('USD Yığım', 'savings', 'USD');

    const categories = await request(app.getHttpServer()).get('/categories').set('Authorization', auth()).expect(200);
    const find = (name: string, kind: string) =>
      categories.body.find((c: { name: string; kind: string }) => c.name === name && c.kind === kind).id;
    foodCategoryId = find('Yemək', 'expense');
    transportCategoryId = find('Nəqliyyat', 'expense');
  });

  beforeEach(() => {
    jevStub.enabled = true;
    jevStub.answer = null;
    jevStub.calls = [];
    claudeStub.enabled = false;
    claudeStub.extraction = null;
    claudeStub.calls = [];
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, session.email);
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/assistant/parse-transaction').send({ text: 'Bravo 45 manat' }).expect(401);
  });

  it('validates the request body', async () => {
    await parse('').expect(400);
    await parse('x'.repeat(301)).expect(400);
    await request(app.getHttpServer()).post('/assistant/parse-transaction').set('Authorization', auth()).send({}).expect(400);
  });

  it('takes direction and category from a keyword rule and asks Jev only about the account', async () => {
    jevStub.answer = { account: { choice: cashAccountId, confidence: 0.9 } };

    const res = await parse('Dünən Bravo-da 45 manat xərclədim').expect(200);

    expect(res.body).toMatchObject({
      direction: 'expense',
      amount: '45',
      currency: 'AZN',
      categoryId: foodCategoryId,
      accountId: cashAccountId,
      dayOffset: -1,
      note: 'Bravo-da',
      source: 'jev',
      warnings: [],
    });
    expect(res.body.confidence).toEqual({ direction: 1, account: 0.9, category: 1 });

    // Qayda istiqaməti/kateqoriyanı həll etdiyi üçün Jev-ə yalnız hesab sualı gedir; namizədlər yalnız AZN hesablarıdır.
    expect(jevStub.calls).toHaveLength(1);
    expect(Object.keys(jevStub.calls[0].questions)).toEqual(['account']);
    expect(Object.keys(jevStub.calls[0].questions.account.options).sort()).toEqual(
      [cardAccountId, cashAccountId, '__none__'].sort(),
    );
  });

  it('resolves everything without calling Jev when a rule matches and the account is named in the text', async () => {
    const res = await parse('Kapital Kart ilə Bravo-da 12,50 manat').expect(200);

    expect(res.body).toMatchObject({
      direction: 'expense',
      amount: '12.50',
      accountId: cardAccountId,
      categoryId: foodCategoryId,
      source: 'parser',
    });
    expect(jevStub.calls).toHaveLength(0);
  });

  it('picks the only account in the detected currency and asks Jev direction + category (not account)', async () => {
    jevStub.answer = {
      direction: { choice: 'expense', confidence: 0.92 },
      category: { choice: transportCategoryId, confidence: 0.88 },
    };

    const res = await parse('20 dollar taksi').expect(200);

    expect(res.body).toMatchObject({
      direction: 'expense',
      currency: 'USD',
      accountId: usdAccountId,
      categoryId: transportCategoryId,
      source: 'jev',
    });
    expect(res.body.confidence).toEqual({ direction: 0.92, account: 1, category: 0.88 });
    expect(Object.keys(jevStub.calls[0].questions).sort()).toEqual(['category', 'direction']);
  });

  it('drops a category whose kind contradicts the direction', async () => {
    jevStub.answer = {
      direction: { choice: 'income', confidence: 0.95 },
      category: { choice: foodCategoryId, confidence: 0.9 }, // xərc kateqoriyası, amma istiqamət gəlir
    };

    const res = await parse('20 dollar bir şey').expect(200);

    expect(res.body.direction).toBe('income');
    expect(res.body.categoryId).toBeNull();
  });

  it('derives the direction from a confident category when the direction itself is unsure', async () => {
    jevStub.answer = {
      direction: { choice: 'expense', confidence: 0.4 },
      category: { choice: transportCategoryId, confidence: 0.9 },
    };

    const res = await parse('20 dollar bir şey').expect(200);

    expect(res.body.categoryId).toBe(transportCategoryId);
    expect(res.body.direction).toBe('expense'); // xərc kateqoriyasından çıxarılıb
    expect(res.body.confidence.direction).toBe(0.9);
  });

  it('leaves fields empty (but reports the real score) when Jev is below the confidence threshold', async () => {
    jevStub.answer = {
      direction: { choice: 'expense', confidence: 0.4 },
      category: { choice: '__none__', confidence: 0.99 },
    };

    const res = await parse('20 dollar bir şey').expect(200);

    expect(res.body.direction).toBeNull();
    expect(res.body.categoryId).toBeNull();
    expect(res.body.confidence.direction).toBe(0.4);
  });

  it('ignores a Jev choice that is not one of the offered options', async () => {
    jevStub.answer = { account: { choice: '00000000-0000-4000-8000-000000000000', confidence: 0.99 } };

    const res = await parse('Bravo-da 45 manat').expect(200);

    expect(res.body.accountId).toBeNull();
  });

  it('still returns the parser result when Jev is unavailable', async () => {
    jevStub.answer = null;
    const failed = await parse('45 manat kofe').expect(200);
    expect(failed.body).toMatchObject({ amount: '45', currency: 'AZN', direction: null, accountId: null, source: 'parser' });

    jevStub.enabled = false;
    jevStub.calls = [];
    const disabled = await parse('45 manat kofe').expect(200);
    expect(disabled.body.source).toBe('parser');
  });

  it('reports amount_missing and does not call Jev when no amount is found', async () => {
    const res = await parse('Bravo-da xərclədim').expect(200);

    expect(res.body.amount).toBeNull();
    expect(res.body.warnings).toEqual(['amount_missing']);
    expect(jevStub.calls).toHaveLength(0);
  });

  it('warns when the text currency has no matching account', async () => {
    jevStub.answer = null;
    const res = await parse('10 avro kitab').expect(200);

    expect(res.body.currency).toBe('EUR');
    expect(res.body.warnings).toEqual(['no_account_in_currency']);
  });

  it('never writes anything — proposing is read-only', async () => {
    jevStub.answer = { direction: { choice: 'expense', confidence: 0.99 } };
    const eventsBefore = await prisma.event.count({ where: { userId: session.userId } });
    const entriesBefore = await prisma.ledgerEntry.count({ where: { accountId: { in: [cardAccountId, cashAccountId, usdAccountId] } } });

    await parse('Bravo-da 45 manat xərclədim').expect(200);

    expect(await prisma.event.count({ where: { userId: session.userId } })).toBe(eventsBefore);
    expect(
      await prisma.ledgerEntry.count({ where: { accountId: { in: [cardAccountId, cashAccountId, usdAccountId] } } }),
    ).toBe(entriesBefore);
  });

  describe('Claude fallback (ADR-0021)', () => {
    const extraction = (overrides: Partial<ClaudeExtraction> = {}): ClaudeExtraction => ({
      direction: 'expense',
      amount: '45',
      currency: 'AZN',
      accountId: null,
      categoryId: null,
      dayOffset: 0,
      note: '',
      ...overrides,
    });

    it('takes over when the parser finds no amount (e.g. a number written in words)', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = extraction({ accountId: cardAccountId, categoryId: foodCategoryId, note: 'Bravo' });

      const res = await parse('Qırx beş manat Bravo-da xərclədim').expect(200);

      expect(res.body).toMatchObject({
        direction: 'expense',
        amount: '45',
        accountId: cardAccountId,
        categoryId: foodCategoryId,
        note: 'Bravo',
        source: 'claude',
        warnings: [],
      });
      expect(res.body.confidence).toEqual({ direction: null, account: null, category: null });
      expect(jevStub.calls).toHaveLength(0); // rəqəm olmadan Jev-in mənası yoxdur
    });

    it('is used even when parser+rule resolve everything but several amounts make the parse ambiguous', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = extraction({ amount: '6', accountId: cardAccountId, categoryId: foodCategoryId });

      const res = await parse('Kapital Kart Bravo 2 kofe 6 manat').expect(200);

      expect(claudeStub.calls).toHaveLength(1);
      expect(res.body).toMatchObject({ amount: '6', source: 'claude' });
    });

    it('is used when Jev fails', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = extraction({ amount: '45', accountId: cashAccountId });
      jevStub.answer = null;

      const res = await parse('45 manat kofe').expect(200);

      expect(res.body).toMatchObject({ accountId: cashAccountId, source: 'claude' });
    });

    it('is used when Jev picked an account with low confidence, but not when the text simply names no account', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = extraction({ accountId: cardAccountId, categoryId: foodCategoryId });

      jevStub.answer = { account: { choice: cardAccountId, confidence: 0.4 } };
      const uncertain = await parse('Bravo-da 45 manat').expect(200);
      expect(uncertain.body.source).toBe('claude');

      claudeStub.calls = [];
      jevStub.answer = { account: { choice: '__none__', confidence: 0.99 } };
      const none = await parse('Bravo-da 45 manat').expect(200);
      expect(none.body.source).toBe('jev');
      expect(claudeStub.calls).toHaveLength(0);
    });

    it('is NOT called when the parser/rule/Jev cascade already resolved the proposal', async () => {
      claudeStub.enabled = true;

      const res = await parse('Kapital Kart ilə Bravo-da 12,50 manat').expect(200);

      expect(res.body.source).toBe('parser');
      expect(claudeStub.calls).toHaveLength(0);
    });

    it('keeps the parser/Jev proposal when Claude fails', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = null;
      jevStub.answer = null;

      const res = await parse('45 manat kofe').expect(200);

      expect(claudeStub.calls).toHaveLength(1);
      expect(res.body).toMatchObject({ amount: '45', currency: 'AZN', source: 'parser' });
    });

    it('drops a category whose kind contradicts the direction Claude returned', async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = extraction({ direction: 'income', categoryId: foodCategoryId });

      const res = await parse('Qırx beş manat gəldi').expect(200);

      expect(res.body.direction).toBe('income');
      expect(res.body.categoryId).toBeNull();
    });

    it("only hands Claude the caller's own accounts and categories", async () => {
      claudeStub.enabled = true;
      claudeStub.extraction = null;

      await parse('Qırx beş manat gəldi').expect(200);

      const input = claudeStub.calls[0];
      expect(input.accounts.map((a) => a.id).sort()).toEqual([cardAccountId, cashAccountId, usdAccountId].sort());
      expect(input.accounts.every((a) => a.userId === session.userId)).toBe(true);
      expect(input.categories.every((c) => c.userId === session.userId)).toBe(true);
    });
  });

  it("does not expose another user's accounts or categories to Jev", async () => {
    const other = await registerAndLogin(app, { baseCurrency: 'AZN' });
    const otherAccount = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(other.accessToken))
      .send({ name: 'Başqasının hesabı', type: 'cash', currency: 'AZN' })
      .expect(201);
    jevStub.answer = null;

    await parse('45 manat kofe').expect(200);

    const serialized = JSON.stringify(jevStub.calls);
    expect(serialized).not.toContain(otherAccount.body.id);
    await cleanupTestUser(prisma, other.email);
  });
});
