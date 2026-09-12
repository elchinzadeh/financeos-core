import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsISO8601, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({ example: 'Ehtiyat fond' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '5000.00' })
  @IsDecimal({ decimal_digits: '0,8' })
  targetAmount!: string;

  @ApiProperty({ example: 'AZN' })
  @IsString()
  @Length(3, 3)
  targetCurrency!: string;

  @ApiProperty({ required: false, example: '2027-01-01' })
  @IsOptional()
  @IsISO8601()
  targetDate?: string;

  @ApiProperty({ required: false, description: 'Tərəqqinin hesablanacağı hesab' })
  @IsOptional()
  @IsUUID()
  linkedAccountId?: string;
}
