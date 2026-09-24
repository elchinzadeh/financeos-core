import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CommitRowDto {
  @ApiProperty({ description: 'preview cavabındakı fingerprint, dəyişmədən geri göndərilir' })
  @IsString()
  fingerprint!: string;

  @ApiProperty()
  @IsISO8601()
  occurredAt!: string;

  @ApiProperty()
  @IsDecimal({ decimal_digits: '0,8' })
  amount!: string;

  @ApiProperty({ enum: ['debit', 'credit'] })
  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    description:
      'Verilibsə, sətir gəlir/xərc kimi yox, bu hesabla (eyni valyutada) aralarında köçürmə kimi yazılır: debit → idxal hesabından bu hesaba, credit → bu hesabdan idxal hesabına. categoryId ilə birgə verilə bilməz.',
  })
  @IsOptional()
  @IsUUID()
  transferAccountId?: string;

  @ApiProperty({ description: 'false = bu sətir idxal edilmir (dublikat/istəyə görə çıxarılıb)' })
  @IsBoolean()
  include!: boolean;

  @ApiProperty({
    required: false,
    description:
      'Verilibsə, bu açar-söz + categoryId istifadəçiyə məxsus yeni CategorySuggestionRule kimi saxlanılır (gələcək idxallarda avtomatik təklif üçün)',
  })
  @IsOptional()
  @IsString()
  saveRuleKeyword?: string;
}
