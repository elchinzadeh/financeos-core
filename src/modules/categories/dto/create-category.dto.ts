import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CategoryKind } from '../../../generated/prisma/enums.js';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Kitablar' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: CategoryKind, example: CategoryKind.expense })
  @IsEnum(CategoryKind)
  kind!: CategoryKind;

  @ApiProperty({ required: false, description: 'Valideyn kateqoriyanın id-si' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ required: false, example: '📚' })
  @IsOptional()
  @IsString()
  icon?: string;
}
