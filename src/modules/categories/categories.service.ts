import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CategoryKind } from '../../generated/prisma/enums.js';
import { DeleteCategoryCommand } from './commands/delete-category.command.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { DeleteCategoryDto } from './dto/delete-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

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
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.getOwnCategory(userId, categoryId);

    let parentId = category.parentId;
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        parentId = null;
      } else {
        const parent = await this.getAccessibleCategory(userId, dto.parentId, category.kind);
        await this.assertNoCycle(categoryId, parent.id);
        parentId = parent.id;
      }
    }

    return this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name ?? undefined,
        icon: dto.icon ?? undefined,
        parentId,
      },
    });
  }

  async remove(userId: string, clientId: string, categoryId: string, dto: DeleteCategoryDto) {
    return this.commandBus.execute(
      new DeleteCategoryCommand(userId, clientId, categoryId, dto.strategy, dto.targetCategoryId),
    );
  }

  /** Cari istifadəçiyə aid kateqoriyanı gətirir, kind-i yoxlayır. */
  async getAccessibleCategory(userId: string, categoryId: string, expectedKind: CategoryKind) {
    const category = await this.getOwnCategory(userId, categoryId);
    if (category.kind !== expectedKind) {
      throw new BadRequestException(
        `Kateqoriya "${category.kind}" tipindədir, "${expectedKind}" gözlənilirdi`,
      );
    }
    return category;
  }

  /** Cari istifadəçiyə aid kateqoriyanı gətirir, növünə (income/expense) baxmır. */
  async getOwnCategory(userId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.userId !== userId) {
      throw new NotFoundException('Kateqoriya tapılmadı');
    }
    return category;
  }

  /** `candidateParentId` `categoryId`-nin özü ya da nəvələrindən biri olmamalıdır. */
  private async assertNoCycle(categoryId: string, candidateParentId: string): Promise<void> {
    let cursor: string | null = candidateParentId;
    while (cursor) {
      if (cursor === categoryId) {
        throw new BadRequestException('Kateqoriya öz nəslindən birinin valideyni ola bilməz');
      }
      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }
}
