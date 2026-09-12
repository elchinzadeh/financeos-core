import { ApiProperty } from '@nestjs/swagger';

export class FxRateResponseDto {
  @ApiProperty()
  baseCurrency!: string;

  @ApiProperty()
  quoteCurrency!: string;

  @ApiProperty()
  rate!: string;

  @ApiProperty()
  rateDate!: string;

  @ApiProperty({ required: false, nullable: true })
  source!: string | null;
}
