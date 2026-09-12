import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClientInfoDto } from './client-info.dto.js';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'AZN', description: 'ISO 4217 valyuta kodu' })
  @IsString()
  @Length(3, 3)
  baseCurrency!: string;

  @ApiProperty({ example: 'az-AZ' })
  @IsString()
  locale!: string;

  @ApiProperty({ type: ClientInfoDto })
  @ValidateNested()
  @Type(() => ClientInfoDto)
  client!: ClientInfoDto;
}
