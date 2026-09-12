import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmPasswordDto {
  @ApiProperty({ description: 'Cari parol, təhlükəli əməliyyatı təsdiqləmək üçün' })
  @IsString()
  @MinLength(1)
  password!: string;
}
