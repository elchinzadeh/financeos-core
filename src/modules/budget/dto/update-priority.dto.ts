import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class UpdatePriorityDto {
  @ApiProperty()
  @IsInt()
  priority!: number;
}
