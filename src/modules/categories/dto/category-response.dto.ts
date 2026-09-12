import { ApiProperty } from '@nestjs/swagger';
import { CategoryKind } from '../../../generated/prisma/enums.js';

export class CategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false, nullable: true })
  userId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  parentId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: CategoryKind })
  kind!: CategoryKind;

  @ApiProperty({ required: false, nullable: true })
  icon!: string | null;
}
