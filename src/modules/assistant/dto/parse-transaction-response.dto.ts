import { ApiProperty } from '@nestjs/swagger';

export class ProposalConfidenceDto {
  @ApiProperty({ nullable: true, description: '0–1. Qayda və ya tək-hesab kimi deterministik hallarda 1' })
  direction!: number | null;

  @ApiProperty({ nullable: true })
  account!: number | null;

  @ApiProperty({ nullable: true })
  category!: number | null;
}

export class ParseTransactionResponseDto {
  @ApiProperty({ enum: ['income', 'expense'], nullable: true })
  direction!: 'income' | 'expense' | null;

  @ApiProperty({ nullable: true, example: '45.90', description: 'Onluq mətn; heç vaxt float deyil' })
  amount!: string | null;

  @ApiProperty({ nullable: true, example: 'AZN', description: 'Mətndə aşkarlanan valyuta; hesabın valyutası ilə uyğunluğunu client yoxlayır' })
  currency!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  accountId!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  categoryId!: string | null;

  @ApiProperty({ description: '0 = bu gün, -1 = dünən, -2 = srağagün. Yerli tarixi client hesablayır (users-də timezone yoxdur)' })
  dayOffset!: number;

  @ApiProperty()
  note!: string;

  @ApiProperty({
    type: ProposalConfidenceDto,
    description:
      'Sahə üzrə etibar. Etibar həddindən aşağı olan sahə null qaytarılır, amma bura yazılan real bal qalır (client vurğulamaq üçün istifadə edə bilər)',
  })
  confidence!: ProposalConfidenceDto;

  @ApiProperty({ enum: ['parser', 'jev', 'claude'], description: 'Təklifi hansı yol formalaşdırıb' })
  source!: 'parser' | 'jev' | 'claude';

  @ApiProperty({ enum: ['amount_missing', 'multiple_amounts', 'no_account_in_currency'], isArray: true })
  warnings!: ('amount_missing' | 'multiple_amounts' | 'no_account_in_currency')[];
}
