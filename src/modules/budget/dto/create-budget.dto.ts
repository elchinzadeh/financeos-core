import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BudgetSource } from '../../../generated/prisma/enums.js';
import { AllocationDto } from './allocation.dto.js';

export class CreateBudgetDto {
  @ApiProperty({ example: 'Aylıq büdcəm' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: BudgetSource })
  @IsEnum(BudgetSource)
  source!: BudgetSource;

  @ApiProperty({ required: false, description: 'GET /budgets/templates-dən, sadəcə istinad üçün' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiProperty({ type: [AllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];

  @ApiProperty()
  @IsInt()
  priority!: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsISO8601()
  activeFrom!: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  activeTo?: string;
}
