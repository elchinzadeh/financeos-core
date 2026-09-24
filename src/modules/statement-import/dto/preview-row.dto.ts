import { ApiProperty } from '@nestjs/swagger';

export class PreviewRowDto {
  @ApiProperty()
  rowIndex!: number;

  @ApiProperty()
  occurredAt!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ description: 'Unsigned məbləğ, istiqamət ayrıca sahədədir' })
  amount!: string;

  @ApiProperty({ enum: ['debit', 'credit'] })
  direction!: 'debit' | 'credit';

  @ApiProperty({ required: false, nullable: true })
  suggestedCategoryId!: string | null;

  @ApiProperty({
    enum: ['rule', 'internal_transfer', 'ai'],
    required: false,
    nullable: true,
    description:
      'Kateqoriya təklifinin mənbəyi: istifadəçinin açar söz qaydası, bankın daxili köçürməsi və ya AI (Jev). Təklif yoxdursa null',
  })
  suggestionSource!: 'rule' | 'internal_transfer' | 'ai' | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Yalnız suggestionSource=ai olanda: Jev-in etibar balı (0–1), əks halda null',
  })
  suggestionConfidence!: number | null;

  @ApiProperty({ description: 'Bankın daxili cib/xəzinə hərəkəti (real gəlir/xərc deyil)' })
  isInternalTransfer!: boolean;

  @ApiProperty({ description: 'accountId+fingerprint üzrə artıq idxal olunmuş sətirlərlə üst-üstə düşür' })
  isDuplicate!: boolean;

  @ApiProperty({ description: 'Faylın öz balans sütunu ilə hesablanan balans uyğun gəlmir (parse xətası ola bilər)' })
  balanceMismatch!: boolean;

  @ApiProperty({
    description: 'commit sorğusunda olduğu kimi geri göndərilməli olan opaque idempotency açarı',
  })
  fingerprint!: string;
}
