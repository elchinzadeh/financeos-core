import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Prisma } from '../../generated/prisma/client.js';
import type { GoalStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrencyFxService } from '../currency-fx/currency-fx.service.js';
import { AbandonGoalCommand } from './commands/abandon-goal.command.js';
import { CompleteGoalCommand } from './commands/complete-goal.command.js';
import { CreateGoalCommand } from './commands/create-goal.command.js';
import { CreateGoalDto } from './dto/create-goal.dto.js';
import { GoalResponseDto } from './dto/goal-response.dto.js';

type GoalRecord = Awaited<ReturnType<PrismaService['goal']['findUniqueOrThrow']>>;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly currencyFxService: CurrencyFxService,
  ) {}

  async create(userId: string, clientId: string, dto: CreateGoalDto): Promise<GoalResponseDto> {
    const goal = await this.commandBus.execute<CreateGoalCommand, GoalRecord>(
      new CreateGoalCommand(
        userId,
        clientId,
        dto.name,
        dto.targetAmount,
        dto.targetCurrency,
        dto.targetDate,
        dto.linkedAccountId,
      ),
    );
    return this.attachProgress(goal);
  }

  async complete(userId: string, clientId: string, goalId: string): Promise<GoalResponseDto> {
    const goal = await this.commandBus.execute<CompleteGoalCommand, GoalRecord>(
      new CompleteGoalCommand(userId, clientId, goalId),
    );
    return this.attachProgress(goal);
  }

  async abandon(userId: string, clientId: string, goalId: string): Promise<GoalResponseDto> {
    const goal = await this.commandBus.execute<AbandonGoalCommand, GoalRecord>(
      new AbandonGoalCommand(userId, clientId, goalId),
    );
    return this.attachProgress(goal);
  }

  async list(userId: string, status?: GoalStatus): Promise<GoalResponseDto[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(goals.map((goal) => this.attachProgress(goal)));
  }

  async getOne(userId: string, goalId: string): Promise<GoalResponseDto> {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal || goal.userId !== userId) {
      throw new NotFoundException('Hədəf tapılmadı');
    }
    return this.attachProgress(goal);
  }

  private async attachProgress(goal: GoalRecord): Promise<GoalResponseDto> {
    let currentAmount: string | null = null;
    let percent: number | null = null;

    if (goal.linkedAccountId) {
      const [account, balanceRow] = await Promise.all([
        this.prisma.account.findUniqueOrThrow({ where: { id: goal.linkedAccountId } }),
        this.prisma.accountBalance.findUnique({ where: { accountId: goal.linkedAccountId } }),
      ]);
      const balance = balanceRow?.balance ?? new Prisma.Decimal(0);
      const rate = await this.currencyFxService.getRate(
        account.currency,
        goal.targetCurrency,
        new Date(),
      );
      const converted = balance.mul(rate);
      currentAmount = converted.toString();
      percent = goal.targetAmount.isZero()
        ? null
        : Math.min(100, converted.div(goal.targetAmount).mul(100).toNumber());
    }

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      targetCurrency: goal.targetCurrency,
      targetDate: goal.targetDate,
      linkedAccountId: goal.linkedAccountId,
      status: goal.status,
      createdAt: goal.createdAt,
      progress: { currentAmount, percent },
    };
  }
}
