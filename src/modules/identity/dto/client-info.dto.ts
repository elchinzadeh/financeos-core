import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ClientType } from '../../../generated/prisma/enums.js';

export class ClientInfoDto {
  @ApiProperty({ enum: ClientType, example: ClientType.mobile })
  @IsEnum(ClientType)
  type!: ClientType;

  @ApiProperty({ example: 'Elçinin telefonu' })
  @IsString()
  @MinLength(1)
  name!: string;
}
