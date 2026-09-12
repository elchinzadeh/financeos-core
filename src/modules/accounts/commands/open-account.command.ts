import type { AccountGroup, AccountType } from '../../../generated/prisma/enums.js';

export class OpenAccountCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly name: string,
    public readonly type: AccountType,
    public readonly currency: string,
    public readonly accountGroup: AccountGroup | undefined,
  ) {}
}
