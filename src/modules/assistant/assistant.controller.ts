import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { AssistantService } from './assistant.service.js';
import { ParseTransactionResponseDto } from './dto/parse-transaction-response.dto.js';
import { ParseTransactionDto } from './dto/parse-transaction.dto.js';

@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('parse-transaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Serbəst mətndən gəlir/xərc təklifi hazırlayır (DB-yə yazmır). Yazmaq üçün istifadəçi təsdiqindən sonra /ledger/record-income və ya /ledger/record-expense çağırılmalıdır',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ParseTransactionResponseDto })
  async parseTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ParseTransactionDto,
  ): Promise<ParseTransactionResponseDto> {
    return this.assistantService.parse(request.user.id, dto.text);
  }
}
