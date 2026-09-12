export class AdjustBalanceCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly accountId: string,
    public readonly delta: string,
    public readonly occurredAt: string | undefined,
    public readonly note: string | undefined,
  ) {}
}
