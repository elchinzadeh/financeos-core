import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../identity/guards/session-auth.guard.js';
import type { AuthenticatedRequest, AuthenticatedUser } from '../identity/identity.types.js';
import { CategoriesService } from './categories.service.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { DeleteCategoryDto } from './dto/delete-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

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
  @ApiOperation({ summary: 'Öz kateqoriyalarının siyahısı' })
  @ApiResponse({ status: HttpStatus.OK, type: [CategoryResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.list(user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kateqoriyanı redaktə et (ad/ikon/valideyn)' })
  @ApiResponse({ status: HttpStatus.OK, type: CategoryResponseDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kateqoriyanı sil (əlaqəli ödənişlər üçün strategiya seçərək)' })
  @ApiResponse({ status: HttpStatus.OK })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DeleteCategoryDto,
  ) {
    return this.categoriesService.remove(request.user.id, request.client.id, id, dto);
  }
}
