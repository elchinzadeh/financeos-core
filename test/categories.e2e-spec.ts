import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin, TestSession } from './utils/auth.js';

describe('Categories (e2e)', () => {
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

  it('lists the seeded system default categories', async () => {
    const res = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(res.body.some((c: { userId: string | null }) => c.userId === null)).toBe(true);
  });

  it('creates and lists a user-owned category', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Kitablar', kind: 'expense', icon: '📚' })
      .expect(201);

    expect(created.body.userId).toBe(session.userId);

    const list = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', bearer(session.accessToken))
      .expect(200);

    expect(list.body.find((c: { id: string }) => c.id === created.body.id)).toBeTruthy();
  });
});
