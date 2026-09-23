import type { DeleteCategoryStrategy } from '../dto/delete-category.dto.js';

export class DeleteCategoryCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly categoryId: string,
    public readonly strategy: DeleteCategoryStrategy,
    public readonly targetCategoryId?: string,
  ) {}
}
