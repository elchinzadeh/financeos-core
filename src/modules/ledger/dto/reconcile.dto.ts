import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ReconcileDto {
  @ApiProperty({ required: false, description: 'Verilməzsə istifadəçinin bütün hesabları' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
