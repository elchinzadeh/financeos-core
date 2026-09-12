import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { CategorySummaryItemDto } from './dto/category-summary-item.dto.js';
import { CategorySummaryQueryDto } from './dto/category-summary-query.dto.js';
import { NetWorthResponseDto } from './dto/net-worth-response.dto.js';
import { TimelinePointDto } from './dto/timeline-point.dto.js';
import { TimelineQueryDto } from './dto/timeline-query.dto.js';
import { NetWorthService } from './net-worth.service.js';

@ApiTags('Net Worth & Reporting')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('net-worth')
export class NetWorthController {
  constructor(private readonly netWorthService: NetWorthService) {}

  @Get()
  @ApiOperation({ summary: 'Cari (ya da asOf tarixindəki) net worth' })
  @ApiResponse({ status: 200, type: NetWorthResponseDto })
  async getSnapshot(@Req() request: AuthenticatedRequest, @Query('asOf') asOf?: string) {
    return this.netWorthService.getSnapshot(
      request.user.id,
      asOf ? parseDateBoundary(asOf, true) : undefined,
    );
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Net worth zaman xətti' })
  @ApiResponse({ status: 200, type: [TimelinePointDto] })
  async getTimeline(@Req() request: AuthenticatedRequest, @Query() query: TimelineQueryDto) {
    return this.netWorthService.getTimeline(
      request.user.id,
      parseDateBoundary(query.from, false),
      parseDateBoundary(query.to, true),
      query.interval ?? 'day',
    );
  }

  @Get('category-summary')
  @ApiOperation({ summary: 'Dövr üzrə kateqoriya üzrə gəlir/xərc hesabatı' })
  @ApiResponse({ status: 200, type: [CategorySummaryItemDto] })
  async getCategorySummary(
    @Req() request: AuthenticatedRequest,
    @Query() query: CategorySummaryQueryDto,
  ) {
    return this.netWorthService.getCategorySummary(
      request.user.id,
      parseDateBoundary(query.from, false),
      parseDateBoundary(query.to, true),
      query.kind,
    );
  }
}

/** Tarix-yalnız ("YYYY-MM-DD") sətirləri `to`/`asOf` üçün günün sonuna, `from` üçün əvvəlinə salır. */
function parseDateBoundary(iso: string, endOfDay: boolean): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  if (isDateOnly && endOfDay) {
    return new Date(`${iso}T23:59:59.999Z`);
  }
  return new Date(iso);
}
