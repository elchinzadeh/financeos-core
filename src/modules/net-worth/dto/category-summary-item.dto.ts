import { ApiProperty } from '@nestjs/swagger';
import { CategoryKind } from '../../../generated/prisma/enums.js';

export class CategorySummaryItemDto {
  @ApiProperty({ required: false, nullable: true, description: 'null = kateqoriyasız' })
  categoryId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  categoryName!: string | null;

  @ApiProperty({ enum: CategoryKind, required: false, nullable: true })
  kind!: CategoryKind | null;

  @ApiProperty({ description: 'Baza valyutada işarəli cəm (gəlir +, xərc −)' })
  total!: string;
}
