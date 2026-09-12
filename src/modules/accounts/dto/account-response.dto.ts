import { ApiProperty } from '@nestjs/swagger';
import { AccountGroup, AccountType } from '../../../generated/prisma/enums.js';

export class AccountResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AccountType })
  type!: AccountType;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: AccountGroup, required: false, nullable: true })
  accountGroup!: AccountGroup | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class AccountWithBalanceResponseDto extends AccountResponseDto {
  @ApiProperty({ description: 'Hesabın öz valyutasında cari balans' })
  balance!: string;
}
