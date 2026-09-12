export class CreateGoalCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly name: string,
    public readonly targetAmount: string,
    public readonly targetCurrency: string,
    public readonly targetDate: string | undefined,
    public readonly linkedAccountId: string | undefined,
  ) {}
}
