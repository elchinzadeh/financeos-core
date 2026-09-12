export class ArchiveAccountCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly accountId: string,
  ) {}
}
