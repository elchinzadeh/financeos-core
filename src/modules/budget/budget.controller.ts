import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { BudgetService } from './budget.service.js';
import { BudgetCheckResponseDto } from './dto/budget-check-response.dto.js';
import { BudgetResponseDto } from './dto/budget-response.dto.js';
import { CreateBudgetDto } from './dto/create-budget.dto.js';
import { UpdatePriorityDto } from './dto/update-priority.dto.js';

@ApiTags('Budget & Rules')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('budgets')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Hardcoded şablonların siyahısı (50/30/20 və s.)' })
  getTemplates() {
    return this.budgetService.getTemplates();
  }

  @Post()
  @ApiOperation({ summary: 'Yeni büdcə yarat' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BudgetResponseDto })
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateBudgetDto) {
    return this.budgetService.create(request.user.id, request.client.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Büdcələrin siyahısı (prioritetə görə sıralı)' })
  @ApiResponse({ status: HttpStatus.OK, type: [BudgetResponseDto] })
  async list(@Req() request: AuthenticatedRequest) {
    return this.budgetService.list(request.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Büdcə detalı' })
  @ApiResponse({ status: HttpStatus.OK, type: BudgetResponseDto })
  async getOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.getOne(request.user.id, id);
  }

  @Get(':id/check')
  @ApiOperation({ summary: 'Faktiki xərci qaydaya qarşı yoxla, limit aşımını aşkarla' })
  @ApiResponse({ status: HttpStatus.OK, type: BudgetCheckResponseDto })
  async check(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.check(request.user.id, id);
  }

  @Post(':id/priority')
  @ApiOperation({ summary: 'Prioriteti yenilə' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BudgetResponseDto })
  async updatePriority(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.budgetService.updatePriority(request.user.id, request.client.id, id, dto.priority);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Büdcəni deaktiv et' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BudgetResponseDto })
  async deactivate(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.deactivate(request.user.id, request.client.id, id);
  }
}
