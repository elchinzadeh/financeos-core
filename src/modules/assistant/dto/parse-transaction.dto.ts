import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ParseTransactionDto {
  @ApiProperty({ example: 'Dünən Bravo-da 45 manat xərclədim', maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string;
}
