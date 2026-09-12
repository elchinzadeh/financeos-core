import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestSession {
  email: string;
  accessToken: string;
  userId: string;
  clientId: string;
}

/** Yeni, təsadüfi email-li istifadəçi qeydiyyatdan keçirir və sessiya açır. */
export async function registerAndLogin(
  app: INestApplication<App>,
  overrides?: { baseCurrency?: string; clientName?: string },
): Promise<TestSession> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const client = { type: 'web', name: overrides?.clientName ?? 'E2E Test Client' };

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email,
      password,
      baseCurrency: overrides?.baseCurrency ?? 'AZN',
      locale: 'az-AZ',
      client,
    })
    .expect(201);

  return {
    email,
    accessToken: res.body.accessToken as string,
    userId: res.body.user.id as string,
    clientId: res.body.client.id as string,
  };
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

/** Test istifadəçisinin yaratdığı bütün sətirləri (FK sırası ilə) silir. */
export async function cleanupTestUser(prisma: PrismaService, email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const accountIds = accounts.map((a) => a.id);

  await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.accountBalance.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  await prisma.event.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });

  const clients = await prisma.client.findMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}
