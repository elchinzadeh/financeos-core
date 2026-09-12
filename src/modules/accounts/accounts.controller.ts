import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest, AuthenticatedUser } from '../identity/identity.types.js';
import { AccountsService } from './accounts.service.js';
import { AccountResponseDto, AccountWithBalanceResponseDto } from './dto/account-response.dto.js';
import { OpenAccountDto } from './dto/open-account.dto.js';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni hesab aç' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AccountResponseDto })
  async open(@Req() request: AuthenticatedRequest, @Body() dto: OpenAccountDto) {
    return this.accountsService.open(request.user.id, request.client.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Cari istifadəçinin hesablarının siyahısı' })
  @ApiResponse({ status: HttpStatus.OK, type: [AccountResponseDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.accountsService.list(user.id, includeArchived === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Hesab detalı + cari balans' })
  @ApiResponse({ status: HttpStatus.OK, type: AccountWithBalanceResponseDto })
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.getWithBalance(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hesabı arxivləşdir' })
  @ApiResponse({ status: HttpStatus.OK, type: AccountResponseDto })
  async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.archive(request.user.id, request.client.id, id);
  }
}
