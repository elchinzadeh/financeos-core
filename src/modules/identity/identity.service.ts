import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_SUGGESTION_RULES,
} from '../categories/default-categories.constants.js';
import { EmailService } from '../email/email.service.js';
import { passwordResetEmailHtml } from '../email/templates/password-reset.template.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { AuthenticatedClient, AuthenticatedUser } from './identity.types.js';

const PASSWORD_SALT_ROUNDS = 10;
const SESSION_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_HOURS = 1;
const INVALID_CREDENTIALS_MESSAGE = 'Email və ya parol yanlışdır';

interface SessionContext {
  session: { id: string; expiresAt: Date };
  user: AuthenticatedUser;
  client: AuthenticatedClient;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Bu email artıq qeydiyyatdan keçib');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = sessionExpiry();

    const { user, client } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          baseCurrency: dto.baseCurrency,
          locale: dto.locale,
        },
      });
      const client = await tx.client.create({
        data: {
          userId: user.id,
          type: dto.client.type,
          name: dto.client.name,
          scopes: [],
        },
      });
      await tx.session.create({
        data: { clientId: client.id, tokenHash, expiresAt },
      });

      const categoryIdByNameAndKind = new Map<string, string>();
      for (const defaultCategory of DEFAULT_CATEGORIES) {
        const category = await tx.category.create({
          data: {
            userId: user.id,
            name: defaultCategory.name,
            kind: defaultCategory.kind,
            icon: defaultCategory.icon,
          },
        });
        categoryIdByNameAndKind.set(`${defaultCategory.name}|${defaultCategory.kind}`, category.id);
      }
      for (const rule of DEFAULT_CATEGORY_SUGGESTION_RULES) {
        const categoryId = categoryIdByNameAndKind.get(`${rule.categoryName}|${rule.categoryKind}`);
        if (!categoryId) continue;
        await tx.categorySuggestionRule.create({
          data: { userId: user.id, keyword: rule.keyword, categoryId },
        });
      }

      return { user, client };
    });

    return {
      accessToken: rawToken,
      user: toAuthenticatedUser(user),
      client: toAuthenticatedClient(client),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    if (user.deactivatedAt) {
      throw new UnauthorizedException('Hesab deaktivdir');
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = sessionExpiry();

    const client = await this.prisma.$transaction(async (tx) => {
      let client = await tx.client.findFirst({
        where: {
          userId: user.id,
          type: dto.client.type,
          name: dto.client.name,
          revokedAt: null,
        },
      });
      if (!client) {
        client = await tx.client.create({
          data: {
            userId: user.id,
            type: dto.client.type,
            name: dto.client.name,
            scopes: [],
          },
        });
      }
      await tx.session.create({
        data: { clientId: client.id, tokenHash, expiresAt },
      });
      return client;
    });

    return {
      accessToken: rawToken,
      user: toAuthenticatedUser(user),
      client: toAuthenticatedClient(client),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /**
   * İstifadəçi tapılmasa da səssizcə qayıdır (email-in mövcudluğunu sızdırmamaq üçün) —
   * controller bu metoddan asılı olmayaraq həmişə {ok:true} qaytarır.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetBaseUrl = (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(',')[0];
    const resetUrl = `${resetBaseUrl}/reset-password?token=${rawToken}`;
    await this.emailService.send({
      to: user.email,
      subject: 'Parolunuzu sıfırlayın',
      html: passwordResetEmailHtml(resetUrl),
    });
  }

  /** Uyğun, istifadə olunmamış, vaxtı keçməmiş token tələb edir — parolu dəyişir, bütün sessiyaları ləğv edir. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const resetToken = await this.prisma.passwordResetToken.findFirst({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token etibarsız və ya vaxtı keçib');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
      const clients = await tx.client.findMany({ where: { userId: resetToken.userId } });
      await tx.session.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
    });
  }

  /** İstifadəçini deaktiv edir: gələcək login-lər rədd olunur, bütün sessiyalar ləğv olunur. */
  async deactivate(userId: string, password: string): Promise<void> {
    await this.verifyPassword(userId, password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
      const clients = await tx.client.findMany({ where: { userId } });
      await tx.session.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
    });
  }

  /**
   * GDPR-tipli tam silinmə: istifadəçiyə aid bütün sətirlər (events daxil) geri dönməz
   * şəkildə silinir — bax docs/decisions/0013-account-deactivation-and-reconciliation.md.
   */
  async deleteAllData(userId: string, password: string): Promise<void> {
    await this.verifyPassword(userId, password);

    await this.prisma.$transaction(async (tx) => {
      const accounts = await tx.account.findMany({ where: { userId } });
      const accountIds = accounts.map((a) => a.id);

      await tx.ledgerEntry.deleteMany({ where: { accountId: { in: accountIds } } });
      await tx.accountBalance.deleteMany({ where: { accountId: { in: accountIds } } });
      await tx.goal.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.event.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.categorySuggestionRule.deleteMany({ where: { userId } });
      await tx.category.deleteMany({ where: { userId } });

      const clients = await tx.client.findMany({ where: { userId } });
      await tx.session.deleteMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
      await tx.client.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Parol yanlışdır');
    }
  }

  async validateSession(rawToken: string): Promise<SessionContext | null> {
    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findFirst({
      where: { tokenHash },
      include: { client: { include: { user: true } } },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (session.client.revokedAt) return null;

    return {
      session: { id: session.id, expiresAt: session.expiresAt },
      user: toAuthenticatedUser(session.client.user),
      client: toAuthenticatedClient(session.client),
    };
  }
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  baseCurrency: string;
  locale: string;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    baseCurrency: user.baseCurrency,
    locale: user.locale,
  };
}

function toAuthenticatedClient(client: {
  id: string;
  type: AuthenticatedClient['type'];
  name: string;
}): AuthenticatedClient {
  return { id: client.id, type: client.type, name: client.name };
}
