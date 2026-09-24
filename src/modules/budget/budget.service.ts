import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BUDGET_TEMPLATES } from './budget.constants.js';
import { getOwnedBudget } from './budget.utils.js';
import { CreateBudgetCommand, type BudgetAllocationInput } from './commands/create-budget.command.js';
import { DeactivateBudgetCommand } from './commands/deactivate-budget.command.js';
import { UpdateBudgetPriorityCommand } from './commands/update-budget-priority.command.js';
import { BudgetCheckResponseDto } from './dto/budget-check-response.dto.js';
import { BudgetResponseDto } from './dto/budget-response.dto.js';
import { CreateBudgetDto } from './dto/create-budget.dto.js';

type BudgetRecord = Awaited<ReturnType<PrismaService['budget']['findUniqueOrThrow']>>;

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  getTemplates() {
    return BUDGET_TEMPLATES;
  }

  async create(userId: string, clientId: string, dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    const budget = await this.commandBus.execute<CreateBudgetCommand, BudgetRecord>(
      new CreateBudgetCommand(
        userId,
        clientId,
        dto.name,
        dto.source,
        dto.allocations,
        dto.priority,
        dto.activeFrom,
        dto.activeTo,
      ),
    );
    return toResponse(budget);
  }

  async updatePriority(
    userId: string,
    clientId: string,
    budgetId: string,
    priority: number,
  ): Promise<BudgetResponseDto> {
    const budget = await this.commandBus.execute<UpdateBudgetPriorityCommand, BudgetRecord>(
      new UpdateBudgetPriorityCommand(userId, clientId, budgetId, priority),
    );
    return toResponse(budget);
  }

  async deactivate(userId: string, clientId: string, budgetId: string): Promise<BudgetResponseDto> {
    const budget = await this.commandBus.execute<DeactivateBudgetCommand, BudgetRecord>(
      new DeactivateBudgetCommand(userId, clientId, budgetId),
    );
    return toResponse(budget);
  }

  async list(userId: string): Promise<BudgetResponseDto[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
    return budgets.map(toResponse);
  }

  async getOne(userId: string, budgetId: string): Promise<BudgetResponseDto> {
    const budget = await getOwnedBudget(this.prisma, userId, budgetId);
    return toResponse(budget);
  }

  async check(userId: string, budgetId: string): Promise<BudgetCheckResponseDto> {
    const budget = await getOwnedBudget(this.prisma, userId, budgetId);
    const allocations = extractAllocations(budget);

    const todayDateOnly = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayDateOnly);
    const todayEnd = endOfDay(todayStart);
    const periodFrom = budget.activeFrom;
    const periodTo =
      budget.activeTo && budget.activeTo.getTime() < todayStart.getTime()
        ? endOfDay(budget.activeTo)
        : todayEnd;

    const totalIncome = await this.sumEntries(userId, periodFrom, periodTo, 'credit');

    const allocationChecks = [];
    for (const allocation of allocations) {
      const category = await this.prisma.category.findUniqueOrThrow({
        where: { id: allocation.categoryId },
      });
      // Xərc kateqoriyasına yazılmış credit-lər (geri qaytarma, ADR-0022) həmin kateqoriyanın xərcini azaldır.
      const spent = await this.sumEntries(userId, periodFrom, periodTo, 'debit', allocation.categoryId);
      const refunded = await this.sumEntries(userId, periodFrom, periodTo, 'credit', allocation.categoryId);
      const actual = spent.sub(refunded);
      const limit = totalIncome.mul(allocation.percent).div(100);
      allocationChecks.push({
        categoryId: allocation.categoryId,
        categoryName: category.name,
        percent: allocation.percent,
        limit: limit.toString(),
        actual: actual.toString(),
        breached: actual.gt(limit),
      });
    }

    return {
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      totalIncome: totalIncome.toString(),
      allocations: allocationChecks,
    };
  }

  private async sumEntries(
    userId: string,
    from: Date,
    to: Date,
    direction: 'credit' | 'debit',
    categoryId?: string,
  ): Promise<Prisma.Decimal> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        account: { userId },
        direction,
        occurredAt: { gte: from, lte: to },
        archivedAt: null,
        ...(categoryId ? { categoryId } : {}),
        // Ümumi gəlir hesablananda xərc kateqoriyalı credit-lər (geri qaytarma) gəlir sayılmır.
        ...(direction === 'credit' && !categoryId
          ? { OR: [{ categoryId: null }, { category: { kind: { not: 'expense' as const } } }] }
          : {}),
      },
    });
    return entries.reduce(
      (sum, entry) => sum.add(entry.amount.mul(entry.fxRateToBase)),
      new Prisma.Decimal(0),
    );
  }
}

function endOfDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
}

function extractAllocations(budget: BudgetRecord): BudgetAllocationInput[] {
  const definition = budget.definition as unknown as { allocations: BudgetAllocationInput[] };
  return definition.allocations;
}

function toResponse(budget: BudgetRecord): BudgetResponseDto {
  return {
    id: budget.id,
    name: budget.name,
    source: budget.source,
    allocations: extractAllocations(budget),
    priority: budget.priority,
    activeFrom: budget.activeFrom,
    activeTo: budget.activeTo,
  };
}
