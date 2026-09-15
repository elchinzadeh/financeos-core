import { BadRequestException, Body, Controller, HttpStatus, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { CommitRequestDto } from './dto/commit-request.dto.js';
import { CommitResponseDto } from './dto/commit-response.dto.js';
import { PreviewRequestDto } from './dto/preview-request.dto.js';
import { PreviewResponseDto } from './dto/preview-response.dto.js';
import { StatementImportService } from './statement-import.service.js';

@ApiTags('Statement Import')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('statement-import')
export class StatementImportController {
  constructor(private readonly statementImportService: StatementImportService) {}

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        accountId: { type: 'string' },
        bankProfile: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bank çıxarışı faylını parse edib idxal öncəsi önizləmə qaytarır (DB-yə yazmır)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PreviewResponseDto })
  async preview(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewRequestDto,
  ) {
    if (!file) {
      throw new BadRequestException('Fayl tələb olunur');
    }
    return this.statementImportService.preview(request.user.id, dto.accountId, dto.bankProfile, file.buffer);
  }

  @Post('commit')
  @ApiOperation({ summary: 'Təsdiqlənmiş sətirləri ledger-ə yazır (recordIncome/recordExpense vasitəsilə)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CommitResponseDto })
  async commit(@Req() request: AuthenticatedRequest, @Body() dto: CommitRequestDto) {
    return this.statementImportService.commit(request.user.id, request.client.id, dto.accountId, dto.rows);
  }
}
