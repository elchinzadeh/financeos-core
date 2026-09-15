export class RecordIncomeCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly accountId: string,
    public readonly amount: string,
    public readonly categoryId: string | undefined,
    public readonly occurredAt: string | undefined,
    public readonly note: string | undefined,
    public readonly externalRef: string | undefined,
  ) {}
}
