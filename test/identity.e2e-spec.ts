import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { EmailService, type SendEmailParams } from './../src/modules/email/email.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Identity & Access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sentEmails: SendEmailParams[] = [];

  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const client = { type: 'web', name: 'E2E Test Client' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: async (params: SendEmailParams) => void sentEmails.push(params) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const clients = await prisma.client.findMany({ where: { userId: user.id } });
      await prisma.session.deleteMany({
        where: { clientId: { in: clients.map((c) => c.id) } },
      });
      await prisma.client.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('registers a new user and returns an access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, baseCurrency: 'AZN', locale: 'az-AZ', client })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.client.type).toBe('web');
  });

  it('rejects duplicate registration with the same email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, baseCurrency: 'AZN', locale: 'az-AZ', client })
      .expect(409);
  });

  it('logs in with correct credentials and reuses the same client', async () => {
    const registerClient = await prisma.client.findFirst({
      where: { user: { email }, type: 'web', name: client.name },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, client })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.client.id).toBe(registerClient?.id);
  });

  it('rejects login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password', client })
      .expect(401);
  });

  it('returns the current user for a valid session, and rejects missing/invalid tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, client })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.user.email).toBe(email);
      });

    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('invalidates the session on logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, client })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  describe('forgot/reset password', () => {
    const fpEmail = `e2e-fp-${randomUUID()}@example.com`;
    let fpPassword = 'correct-horse-battery-staple';
    const fpClient = { type: 'web', name: 'E2E FP Client' };

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: fpEmail, password: fpPassword, baseCurrency: 'AZN', locale: 'az-AZ', client: fpClient })
        .expect(201);
    });

    afterAll(async () => {
      const user = await prisma.user.findUnique({ where: { email: fpEmail } });
      if (user) {
        const clients = await prisma.client.findMany({ where: { userId: user.id } });
        await prisma.session.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.client.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    function extractResetToken(): string {
      const last = sentEmails[sentEmails.length - 1];
      const match = /token=([a-f0-9]+)/.exec(last.html);
      if (!match) throw new Error('reset token tapılmadı email html-də');
      return match[1];
    }

    it('sends a reset email and creates a token row for an existing user', async () => {
      const before = sentEmails.length;
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: fpEmail })
        .expect(200)
        .expect({ ok: true });

      expect(sentEmails).toHaveLength(before + 1);
      expect(sentEmails[sentEmails.length - 1].to).toBe(fpEmail);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: fpEmail } });
      const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
      expect(tokens).toHaveLength(1);
    });

    it('does not leak whether an email is registered', async () => {
      const before = sentEmails.length;
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: `e2e-nonexistent-${randomUUID()}@example.com` })
        .expect(200)
        .expect({ ok: true });

      expect(sentEmails).toHaveLength(before);
    });

    it('rejects reset with an invalid token', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'irrelevant123' })
        .expect(400);
    });

    it('rejects reset with an expired token', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: fpEmail })
        .expect(200);
      const resetToken = extractResetToken();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: fpEmail } });
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, password: 'irrelevant123' })
        .expect(400);
    });

    it('resets the password, invalidates existing sessions, and rejects token reuse', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: fpEmail, password: fpPassword, client: fpClient })
        .expect(200);
      const oldAccessToken = login.body.accessToken as string;

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: fpEmail })
        .expect(200);
      const resetToken = extractResetToken();

      const newPassword = 'new-correct-horse-battery';
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, password: newPassword })
        .expect(200)
        .expect({ ok: true });
      fpPassword = newPassword;

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: fpEmail, password: 'correct-horse-battery-staple', client: fpClient })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: fpEmail, password: newPassword, client: fpClient })
        .expect(200);

      // eyni token ikinci dəfə istifadə oluna bilməz
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, password: 'another-password-123' })
        .expect(400);
    });
  });
});
