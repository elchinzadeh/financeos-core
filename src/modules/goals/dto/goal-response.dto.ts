import { ApiProperty } from '@nestjs/swagger';
import { GoalStatus } from '../../../generated/prisma/enums.js';

export class GoalProgressDto {
  @ApiProperty({ required: false, nullable: true, description: 'linkedAccountId yoxdursa null' })
  currentAmount!: string | null;

  @ApiProperty({ required: false, nullable: true })
  percent!: number | null;
}

export class GoalResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  targetAmount!: string;

  @ApiProperty()
  targetCurrency!: string;

  @ApiProperty({ required: false, nullable: true })
  targetDate!: Date | null;

  @ApiProperty({ required: false, nullable: true })
  linkedAccountId!: string | null;

  @ApiProperty({ enum: GoalStatus })
  status!: GoalStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: GoalProgressDto })
  progress!: GoalProgressDto;
}
