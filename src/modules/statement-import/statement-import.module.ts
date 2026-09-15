import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { StatementImportController } from './statement-import.controller.js';
import { StatementImportService } from './statement-import.service.js';

@Module({
  imports: [IdentityModule, AccountsModule, CategoriesModule, LedgerModule],
  controllers: [StatementImportController],
  providers: [StatementImportService],
})
export class StatementImportModule {}
