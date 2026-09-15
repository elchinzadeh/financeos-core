import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { CommitRowDto } from './commit-row.dto.js';

export class CommitRequestDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ type: [CommitRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommitRowDto)
  rows!: CommitRowDto[];
}
