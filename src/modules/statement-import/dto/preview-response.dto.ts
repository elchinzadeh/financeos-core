import { ApiProperty } from '@nestjs/swagger';
import { PreviewRowDto } from './preview-row.dto.js';

export class PreviewResponseDto {
  @ApiProperty({ type: [PreviewRowDto] })
  rows!: PreviewRowDto[];

  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  duplicateCount!: number;

  @ApiProperty()
  balanceMismatchCount!: number;
}
