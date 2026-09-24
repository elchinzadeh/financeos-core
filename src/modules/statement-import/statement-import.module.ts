import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JevModule } from '../jev/jev.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CategoryAiSuggester } from './category-ai-suggester.js';
import { StatementImportController } from './statement-import.controller.js';
import { StatementImportService } from './statement-import.service.js';

@Module({
  imports: [IdentityModule, AccountsModule, CategoriesModule, LedgerModule, JevModule],
  controllers: [StatementImportController],
  providers: [StatementImportService, CategoryAiSuggester],
})
export class StatementImportModule {}
