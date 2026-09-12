import { Body, Controller, Get, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../identity/identity.types.js';
import { CategoriesService } from './categories.service.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni (öz) kateqoriya yarat' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CategoryResponseDto })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Sistem default + öz kateqoriyaların siyahısı' })
  @ApiResponse({ status: HttpStatus.OK, type: [CategoryResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.list(user.id);
  }
}
