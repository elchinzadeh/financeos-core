import { Controller, Get, Post, Body, Query, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import { CurrencyFxService } from './currency-fx.service.js';
import { FxRateResponseDto } from './dto/fx-rate-response.dto.js';
import { UpsertFxRateDto } from './dto/upsert-fx-rate.dto.js';

@ApiTags('Currency & FX')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('fx-rates')
export class CurrencyFxController {
  constructor(private readonly currencyFxService: CurrencyFxService) {}

  @Post()
  @ApiOperation({ summary: 'Gündəlik kursu əl ilə əlavə et/yenilə' })
  @ApiResponse({ status: HttpStatus.CREATED, type: FxRateResponseDto })
  async upsert(@Body() dto: UpsertFxRateDto) {
    return this.currencyFxService.upsertRate(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Kursları sorğula (son 30, ən yenisi əvvəldə)' })
  @ApiResponse({ status: HttpStatus.OK, type: [FxRateResponseDto] })
  async find(@Query('base') base?: string, @Query('quote') quote?: string) {
    return this.currencyFxService.find(base, quote);
  }
}
