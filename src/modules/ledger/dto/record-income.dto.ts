import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordIncomeDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: '500.00' })
  @IsDecimal({ decimal_digits: '0,8' })
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false, description: 'Default: indi' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    description:
      'İdempotency açarı (məs. bank idxalı fingerprint-i). Eyni accountId+externalRef ilə təkrar sorğu yeni sətir yaratmır, mövcud olanı qaytarır.',
  })
  @IsOptional()
  @IsString()
  externalRef?: string;
}
