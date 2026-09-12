import { ApiProperty } from '@nestjs/swagger';
import { BudgetSource } from '../../../generated/prisma/enums.js';
import { AllocationDto } from './allocation.dto.js';

export class BudgetResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: BudgetSource })
  source!: BudgetSource;

  @ApiProperty({ type: [AllocationDto] })
  allocations!: AllocationDto[];

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  activeFrom!: Date;

  @ApiProperty({ required: false, nullable: true })
  activeTo!: Date | null;
}
