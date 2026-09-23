import { Body, Controller, Get, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { AdjustBalanceDto } from './dto/adjust-balance.dto.js';
import { LedgerEntryResponseDto } from './dto/ledger-entry-response.dto.js';
import { ReconcileDto } from './dto/reconcile.dto.js';
import { ReconcileResultDto } from './dto/reconcile-response.dto.js';
import { RecordExpenseDto } from './dto/record-expense.dto.js';
import { RecordIncomeDto } from './dto/record-income.dto.js';
import { TransferDto } from './dto/transfer.dto.js';
import { LedgerService } from './ledger.service.js';

@ApiTags('Ledger')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('record-income')
  @ApiOperation({ summary: 'Gəlir qeyd et' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LedgerEntryResponseDto })
  async recordIncome(@Req() request: AuthenticatedRequest, @Body() dto: RecordIncomeDto) {
    return this.ledgerService.recordIncome(request.user.id, request.client.id, dto);
  }

  @Post('record-expense')
  @ApiOperation({ summary: 'Xərc qeyd et' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LedgerEntryResponseDto })
  async recordExpense(@Req() request: AuthenticatedRequest, @Body() dto: RecordExpenseDto) {
    return this.ledgerService.recordExpense(request.user.id, request.client.id, dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Hesablar arası köçürmə' })
  @ApiResponse({ status: HttpStatus.CREATED, type: [LedgerEntryResponseDto] })
  async transfer(@Req() request: AuthenticatedRequest, @Body() dto: TransferDto) {
    return this.ledgerService.transfer(request.user.id, request.client.id, dto);
  }

  @Post('adjust-balance')
  @ApiOperation({ summary: 'Balansı əl ilə düzəlt (məs. reconciliation)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LedgerEntryResponseDto })
  async adjustBalance(@Req() request: AuthenticatedRequest, @Body() dto: AdjustBalanceDto) {
    return this.ledgerService.adjustBalance(request.user.id, request.client.id, dto);
  }

  @Get('entries')
  @ApiOperation({ summary: 'Ledger sətirlərinin siyahısı (istəyə görə hesaba görə filtr)' })
  @ApiResponse({ status: HttpStatus.OK, type: [LedgerEntryResponseDto] })
  async listEntries(
    @Req() request: AuthenticatedRequest,
    @Query('accountId') accountId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.ledgerService.listEntries(request.user.id, accountId, includeArchived === 'true');
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'account_balances cache-ini ledger_entries-dən yenidən hesabla',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: [ReconcileResultDto] })
  async reconcile(@Req() request: AuthenticatedRequest, @Body() dto: ReconcileDto) {
    return this.ledgerService.reconcile(request.user.id, dto.accountId);
  }
}
