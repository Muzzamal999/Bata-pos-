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
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthenticatedUser, dto: CreateBrandDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);
    if (tenantId === null) {
      throw new BadRequestException('tenantId is required to create a brand');
    }

    const existing = await this.prisma.brand.findFirst({ where: { tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A brand with this name already exists in this tenant');
    }

    return this.prisma.brand.create({ data: { tenantId, name: dto.name } });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListBrandsQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);
    const where = tenantId === null ? {} : { tenantId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, brand.tenantId);
    return brand;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateBrandDto) {
    const brand = await this.findOne(caller, id);

    if (dto.name) {
      const existing = await this.prisma.brand.findFirst({
        where: { tenantId: brand.tenantId, name: dto.name, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('A brand with this name already exists in this tenant');
      }
    }

    return this.prisma.brand.update({ where: { id }, data: dto });
  }
}
