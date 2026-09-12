import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdjustBalanceDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    example: '-12.50',
    description: 'İşarəli düzəliş məbləği (mənfi = balansı azaldır)',
  })
  @IsDecimal({ decimal_digits: '0,8' })
  delta!: string;

  @ApiProperty({ required: false, description: 'Default: indi' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
