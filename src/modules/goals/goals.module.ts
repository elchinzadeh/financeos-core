import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CurrencyFxModule } from '../currency-fx/currency-fx.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AbandonGoalHandler } from './commands/abandon-goal.handler.js';
import { CompleteGoalHandler } from './commands/complete-goal.handler.js';
import { CreateGoalHandler } from './commands/create-goal.handler.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [CqrsModule, IdentityModule, AccountsModule, CurrencyFxModule],
  controllers: [GoalsController],
  providers: [GoalsService, CreateGoalHandler, CompleteGoalHandler, AbandonGoalHandler],
})
export class GoalsModule {}
