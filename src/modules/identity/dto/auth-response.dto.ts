import { ApiProperty } from '@nestjs/swagger';
import { ClientType } from '../../../generated/prisma/enums.js';

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  baseCurrency!: string;

  @ApiProperty()
  locale!: string;
}

export class AuthClientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ClientType })
  type!: ClientType;

  @ApiProperty()
  name!: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthClientDto })
  client!: AuthClientDto;
}
