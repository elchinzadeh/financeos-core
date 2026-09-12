import { ApiProperty } from '@nestjs/swagger';
import { AuthClientDto, AuthUserDto } from './auth-response.dto.js';

export class MeResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthClientDto })
  client!: AuthClientDto;
}
