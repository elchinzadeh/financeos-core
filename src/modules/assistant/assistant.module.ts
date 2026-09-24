import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JevModule } from '../jev/jev.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { ClaudeTransactionExtractor } from './claude-transaction-extractor.js';

@Module({
  imports: [IdentityModule, AccountsModule, JevModule],
  controllers: [AssistantController],
  providers: [AssistantService, ClaudeTransactionExtractor],
})
export class AssistantModule {}
