export class DeactivateBudgetCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly budgetId: string,
  ) {}
}
