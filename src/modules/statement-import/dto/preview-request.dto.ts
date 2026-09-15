import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { BANK_PROFILE_IDS } from '../bank-profiles/bank-profile.registry.js';

export class PreviewRequestDto {
  @ApiProperty({ description: 'Faylın idxal ediləcəyi hesab' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ enum: BANK_PROFILE_IDS })
  @IsIn(BANK_PROFILE_IDS)
  bankProfile!: string;
}
