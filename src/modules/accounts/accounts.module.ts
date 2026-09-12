import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { ArchiveAccountHandler } from './commands/archive-account.handler.js';
import { OpenAccountHandler } from './commands/open-account.handler.js';

@Module({
  imports: [CqrsModule, IdentityModule],
  controllers: [AccountsController],
  providers: [AccountsService, OpenAccountHandler, ArchiveAccountHandler],
  exports: [AccountsService],
})
export class AccountsModule {}
