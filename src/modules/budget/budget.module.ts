import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CategoriesModule } from '../categories/categories.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';
import { CreateBudgetHandler } from './commands/create-budget.handler.js';
import { DeactivateBudgetHandler } from './commands/deactivate-budget.handler.js';
import { UpdateBudgetPriorityHandler } from './commands/update-budget-priority.handler.js';

@Module({
  imports: [CqrsModule, IdentityModule, CategoriesModule],
  controllers: [BudgetController],
  providers: [BudgetService, CreateBudgetHandler, UpdateBudgetPriorityHandler, DeactivateBudgetHandler],
})
export class BudgetModule {}
