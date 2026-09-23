import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from '../identity/identity.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { DeleteCategoryHandler } from './commands/delete-category.handler.js';

@Module({
  imports: [CqrsModule, IdentityModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, DeleteCategoryHandler],
  exports: [CategoriesService],
})
export class CategoriesModule {}
