import { ApiProperty } from '@nestjs/swagger';

export class NetWorthAccountDto {
  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ description: 'Hesabın öz valyutasında balans' })
  balance!: string;

  @ApiProperty({ description: 'Baza valyutaya çevrilmiş balans' })
  convertedBalance!: string;
}

export class NetWorthResponseDto {
  @ApiProperty()
  asOf!: string;

  @ApiProperty()
  baseCurrency!: string;

  @ApiProperty({ description: 'Bütün hesabların baza valyutaya çevrilmiş cəmi' })
  total!: string;

  @ApiProperty({ type: [NetWorthAccountDto] })
  accounts!: NetWorthAccountDto[];
}
