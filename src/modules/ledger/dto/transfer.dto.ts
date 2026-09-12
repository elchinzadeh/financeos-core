import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty()
  @IsUUID()
  toAccountId!: string;

  @ApiProperty({ example: '100.00', description: 'fromAccount-un valyutasında' })
  @IsDecimal({ decimal_digits: '0,8' })
  amount!: string;

  @ApiProperty({ required: false, description: 'Default: indi' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
