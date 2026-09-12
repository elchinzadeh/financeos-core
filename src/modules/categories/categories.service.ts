import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CategoryKind } from '../../generated/prisma/enums.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.getAccessibleCategory(userId, dto.parentId, dto.kind);
    }

    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        kind: dto.kind,
        parentId: dto.parentId,
        icon: dto.icon,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: { name: 'asc' },
    });
  }

  /** Sistem (user_id=NULL) ya da cari istifadəçiyə aid kateqoriyanı gətirir, kind-i yoxlayır. */
  async getAccessibleCategory(userId: string, categoryId: string, expectedKind: CategoryKind) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || (category.userId !== null && category.userId !== userId)) {
      throw new NotFoundException('Kateqoriya tapılmadı');
    }
    if (category.kind !== expectedKind) {
      throw new BadRequestException(
        `Kateqoriya "${category.kind}" tipindədir, "${expectedKind}" gözlənilirdi`,
      );
    }
    return category;
  }
}
