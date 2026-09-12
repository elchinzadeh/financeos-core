import { ApiProperty } from '@nestjs/swagger';

export class ReconcileResultDto {
  @ApiProperty()
  accountId!: string;

  @ApiProperty()
  previousBalance!: string;

  @ApiProperty()
  newBalance!: string;

  @ApiProperty({ description: 'Cache köhnə dəyərdən fərqli idisə true' })
  corrected!: boolean;
}
