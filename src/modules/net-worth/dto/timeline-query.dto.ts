import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class TimelineQueryDto {
  @ApiProperty()
  @IsISO8601()
  from!: string;

  @ApiProperty()
  @IsISO8601()
  to!: string;

  @ApiProperty({ required: false, enum: ['day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: 'day' | 'week' | 'month';
}
