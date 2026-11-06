import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess, resolveTenantScope } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthenticatedUser, dto: CreateCategoryDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);
    if (tenantId === null) {
      throw new BadRequestException('tenantId is required to create a category');
    }

    const existing = await this.prisma.category.findFirst({ where: { tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A category with this name already exists in this tenant');
    }

    return this.prisma.category.create({ data: { tenantId, name: dto.name } });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListCategoriesQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);
    const where = tenantId === null ? {} : { tenantId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, category.tenantId);
    return category;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(caller, id);

    if (dto.name) {
      const existing = await this.prisma.category.findFirst({
        where: { tenantId: category.tenantId, name: dto.name, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('A category with this name already exists in this tenant');
      }
    }

    return this.prisma.category.update({ where: { id }, data: dto });
  }
}
