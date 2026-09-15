import { ApiProperty } from '@nestjs/swagger';

export class CommitResponseDto {
  @ApiProperty()
  imported!: number;

  @ApiProperty({ description: 'externalRef artıq mövcud olduğu üçün yazılmayan sətirlər' })
  skippedDuplicates!: number;

  @ApiProperty({ description: '`include: false` olduğu üçün heç göndərilməyən sətirlər' })
  excluded!: number;
}
