import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class UpsertFxRateDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  baseCurrency!: string;

  @ApiProperty({ example: 'AZN' })
  @IsString()
  @Length(3, 3)
  quoteCurrency!: string;

  @ApiProperty({ example: '1.7000', description: '1 baseCurrency neçə quoteCurrency edir' })
  @IsDecimal({ decimal_digits: '0,8' })
  rate!: string;

  @ApiProperty({ required: false, example: '2026-09-12', description: 'Default: bugün' })
  @IsOptional()
  @IsISO8601()
  rateDate?: string;

  @ApiProperty({ required: false, example: 'manual' })
  @IsOptional()
  @IsString()
  source?: string;
}
