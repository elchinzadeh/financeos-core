import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { AccountGroup, AccountType } from '../../../generated/prisma/enums.js';

export class OpenAccountDto {
  @ApiProperty({ example: 'Kapital Bank - əsas kart' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: AccountType, example: AccountType.bank })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ example: 'AZN' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ enum: AccountGroup, required: false })
  @IsOptional()
  @IsEnum(AccountGroup)
  accountGroup?: AccountGroup;
}
