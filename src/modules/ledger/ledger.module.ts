import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CurrencyFxModule } from '../currency-fx/currency-fx.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdjustBalanceHandler } from './commands/adjust-balance.handler.js';
import { RecordExpenseHandler } from './commands/record-expense.handler.js';
import { RecordIncomeHandler } from './commands/record-income.handler.js';
import { TransferBetweenAccountsHandler } from './commands/transfer-between-accounts.handler.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [CqrsModule, IdentityModule, AccountsModule, CategoriesModule, CurrencyFxModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    RecordIncomeHandler,
    RecordExpenseHandler,
    TransferBetweenAccountsHandler,
    AdjustBalanceHandler,
  ],
})
export class LedgerModule {}
