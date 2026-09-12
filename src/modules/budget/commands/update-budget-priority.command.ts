export class UpdateBudgetPriorityCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly budgetId: string,
    public readonly priority: number,
  ) {}
}
