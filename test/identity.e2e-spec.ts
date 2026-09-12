import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Identity & Access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const client = { type: 'web', name: 'E2E Test Client' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
});
