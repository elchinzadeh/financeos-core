import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const DELETE_CATEGORY_STRATEGIES = ['reassign', 'uncategorize', 'delete', 'archive'] as const;
export type DeleteCategoryStrategy = (typeof DELETE_CATEGORY_STRATEGIES)[number];

export class DeleteCategoryDto {
  @ApiProperty({
    enum: DELETE_CATEGORY_STRATEGIES,
    description: 'Kateqoriyaya aid ödənişlərlə nə edilsin',
  })
  @IsIn(DELETE_CATEGORY_STRATEGIES)
  strategy!: DeleteCategoryStrategy;

  @ApiProperty({ required: false, description: 'strategy="reassign" olduqda məcburidir' })
  @IsOptional()
  @IsUUID()
  targetCategoryId?: string;
}
