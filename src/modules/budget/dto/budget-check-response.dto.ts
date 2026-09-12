import { ApiProperty } from '@nestjs/swagger';

export class AllocationCheckDto {
  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiProperty()
  percent!: number;

  @ApiProperty({ description: 'Baza valyutada: dövr gəliri × percent/100' })
  limit!: string;

  @ApiProperty({ description: 'Baza valyutada faktiki xərc (donmuş fx_rate_to_base ilə)' })
  actual!: string;

  @ApiProperty()
  breached!: boolean;
}

export class BudgetCheckResponseDto {
  @ApiProperty()
  periodFrom!: string;

  @ApiProperty()
  periodTo!: string;

  @ApiProperty()
  totalIncome!: string;

  @ApiProperty({ type: [AllocationCheckDto] })
  allocations!: AllocationCheckDto[];
}
