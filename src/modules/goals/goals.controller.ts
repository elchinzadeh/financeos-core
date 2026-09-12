import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest } from '../identity/identity.types.js';
import { CreateGoalDto } from './dto/create-goal.dto.js';
import { GoalResponseDto } from './dto/goal-response.dto.js';
import { GoalsService } from './goals.service.js';
import type { GoalStatus } from '../../generated/prisma/enums.js';

@ApiTags('Goals')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni hədəf yarat' })
  @ApiResponse({ status: HttpStatus.CREATED, type: GoalResponseDto })
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(request.user.id, request.client.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Hədəflərin siyahısı (istəyə görə status filtri)' })
  @ApiResponse({ status: HttpStatus.OK, type: [GoalResponseDto] })
  async list(@Req() request: AuthenticatedRequest, @Query('status') status?: GoalStatus) {
    return this.goalsService.list(request.user.id, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Hədəf detalı + tərəqqi' })
  @ApiResponse({ status: HttpStatus.OK, type: GoalResponseDto })
  async getOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalsService.getOne(request.user.id, id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Hədəfi tamamlanmış kimi işarələ' })
  @ApiResponse({ status: HttpStatus.CREATED, type: GoalResponseDto })
  async complete(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalsService.complete(request.user.id, request.client.id, id);
  }

  @Post(':id/abandon')
  @ApiOperation({ summary: 'Hədəfdən imtina et' })
  @ApiResponse({ status: HttpStatus.CREATED, type: GoalResponseDto })
  async abandon(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.goalsService.abandon(request.user.id, request.client.id, id);
  }
}
