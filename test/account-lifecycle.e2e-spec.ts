import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, cleanupTestUser, registerAndLogin } from './utils/auth.js';

const PASSWORD = 'correct-horse-battery-staple';

describe('Account lifecycle: deactivation & data deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
    await app.close();
  });

  it('rejects deactivation/deletion with the wrong password', async () => {
    const session = await registerAndLogin(app);
    try {
      await request(app.getHttpServer())
        .post('/auth/deactivate')
        .set('Authorization', bearer(session.accessToken))
        .send({ password: 'wrong-password' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/delete-data')
        .set('Authorization', bearer(session.accessToken))
        .send({ password: 'wrong-password' })
        .expect(401);
    } finally {
      await cleanupTestUser(prisma, session.email);
    }
  });

  it('deactivation revokes all sessions and blocks future login', async () => {
    const email = `e2e-lifecycle-${Date.now()}@example.com`;
    const client = { type: 'web', name: 'Lifecycle Test' };

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD, baseCurrency: 'AZN', locale: 'az-AZ', client })
      .expect(201);
    const firstToken = register.body.accessToken as string;

    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD, client })
      .expect(200);
    const secondToken = secondLogin.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/deactivate')
      .set('Authorization', bearer(firstToken))
      .send({ password: PASSWORD })
      .expect(200);

    // Deaktivasiyanı çağıran token-in özü daxil, bütün sessiyalar ləğv olunub.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(firstToken))
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(secondToken))
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD, client })
      .expect(401);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.deactivatedAt).not.toBeNull();

    await cleanupTestUser(prisma, email);
  });

  it('deleting all data removes the user and every owned row', async () => {
    const session = await registerAndLogin(app, { baseCurrency: 'AZN' });

    const account = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', bearer(session.accessToken))
      .send({ name: 'Silinəcək hesab', type: 'cash', currency: 'AZN' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/ledger/record-income')
      .set('Authorization', bearer(session.accessToken))
      .send({ accountId: account.body.id, amount: '10.00' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/delete-data')
      .set('Authorization', bearer(session.accessToken))
      .send({ password: PASSWORD })
      .expect(200);

    const user = await prisma.user.findUnique({ where: { email: session.email } });
    expect(user).toBeNull();
    const remainingAccount = await prisma.account.findUnique({ where: { id: account.body.id } });
    expect(remainingAccount).toBeNull();

    // Sessiya artıq mövcud deyil, sonrakı sorğular 401 olmalıdır.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(session.accessToken))
      .expect(401);
  });
});
