import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CurrencyFxModule } from './modules/currency-fx/currency-fx.module.js';
import { NetWorthModule } from './modules/net-worth/net-worth.module.js';
import { BudgetModule } from './modules/budget/budget.module.js';
import { GoalsModule } from './modules/goals/goals.module.js';
import { StatementImportModule } from './modules/statement-import/statement-import.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    IdentityModule,
    AccountsModule,
    LedgerModule,
    CategoriesModule,
    CurrencyFxModule,
    NetWorthModule,
    BudgetModule,
    GoalsModule,
    StatementImportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
