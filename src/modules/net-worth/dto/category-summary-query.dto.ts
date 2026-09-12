import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { CategoryKind } from '../../../generated/prisma/enums.js';

export class CategorySummaryQueryDto {
  @ApiProperty()
  @IsISO8601()
  from!: string;

  @ApiProperty()
  @IsISO8601()
  to!: string;

  @ApiProperty({ required: false, enum: CategoryKind })
  @IsOptional()
  @IsEnum(CategoryKind)
  kind?: CategoryKind;
}
