import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { CommitRowDto } from './commit-row.dto.js';

export class CommitRequestDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ type: [CommitRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CommitRowDto)
  rows!: CommitRowDto[];
}
