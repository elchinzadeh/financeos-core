import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';
import { ClientInfoDto } from './client-info.dto.js';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ type: ClientInfoDto })
  @ValidateNested()
  @Type(() => ClientInfoDto)
  client!: ClientInfoDto;
}
