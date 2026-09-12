import type { BudgetSource } from '../../../generated/prisma/enums.js';

export interface BudgetAllocationInput {
  categoryId: string;
  percent: number;
}

export class CreateBudgetCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly name: string,
    public readonly source: BudgetSource,
    public readonly allocations: BudgetAllocationInput[],
    public readonly priority: number,
    public readonly activeFrom: string,
    public readonly activeTo: string | undefined,
  ) {}
}
