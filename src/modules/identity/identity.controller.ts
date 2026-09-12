import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { ConfirmPasswordDto } from './dto/confirm-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { MeResponseDto } from './dto/me-response.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { IdentityService } from './identity.service.js';
import type { AuthenticatedRequest, AuthenticatedUser } from './identity.types.js';

@ApiTags('Auth')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  @ApiOperation({ summary: 'Yeni istifadəçi və client qeydiyyatı' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.identityService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email/parol ilə login, yeni sessiya token-i' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.identityService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cari sessiyanı bitirir' })
  async logout(@Req() request: AuthenticatedRequest): Promise<{ ok: true }> {
    await this.identityService.logout(request.sessionId);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cari istifadəçi və client məlumatı' })
  @ApiResponse({ status: HttpStatus.OK, type: MeResponseDto })
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<MeResponseDto> {
    return { user, client: request.client };
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hesabı deaktiv et (bütün sessiyalar ləğv olunur, login bloklanır)' })
  async deactivate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ConfirmPasswordDto,
  ): Promise<{ ok: true }> {
    await this.identityService.deactivate(request.user.id, dto.password);
    return { ok: true };
  }

  @Post('delete-data')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bütün datanı geri dönməz şəkildə sil (GDPR)' })
  async deleteData(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ConfirmPasswordDto,
  ): Promise<{ ok: true }> {
    await this.identityService.deleteAllData(request.user.id, dto.password);
    return { ok: true };
  }
}
