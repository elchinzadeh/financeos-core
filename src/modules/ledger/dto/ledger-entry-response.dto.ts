import { ApiProperty } from '@nestjs/swagger';
import { EntryDirection } from '../../../generated/prisma/enums.js';

export class LedgerEntryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  transactionGroupId!: string;

  @ApiProperty()
  accountId!: string;

  @ApiProperty({ required: false, nullable: true })
  categoryId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ enum: EntryDirection })
  direction!: EntryDirection;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  fxRateToBase!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ required: false, nullable: true })
  note!: string | null;
}
