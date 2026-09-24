export class TransferBetweenAccountsCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: string,
    public readonly occurredAt: string | undefined,
    public readonly note: string | undefined,
    /** Bank idxalı: hər tərəfin sətrinə `externalRef` (dublikat aşkarlanması üçün). */
    public readonly externalRefs?: { from?: string; to?: string },
  ) {}
}
