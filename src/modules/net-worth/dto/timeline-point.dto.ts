import { ApiProperty } from '@nestjs/swagger';

export class TimelinePointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  netWorth!: string;
}
