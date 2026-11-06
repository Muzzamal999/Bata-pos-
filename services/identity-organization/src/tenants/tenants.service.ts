import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthenticatedUser, dto: CreateTenantDto) {
    this.assertPlatformLevel(caller, 'create a tenant');
    return this.prisma.tenant.create({ data: { name: dto.name } });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: PaginationQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    // A tenant-scoped caller only ever has one tenant to see: their own.
    const where = caller.tenantId !== null ? { id: caller.tenantId } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({ where, skip: query.skip, take: query.limit }),
      this.prisma.tenant.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, tenant.id);
    return tenant;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateTenantDto) {
    await this.findOne(caller, id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async setActive(caller: AuthenticatedUser, id: string, isActive: boolean) {
    this.assertPlatformLevel(caller, isActive ? 'activate a tenant' : 'deactivate a tenant');
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException();
    }
    return this.prisma.tenant.update({ where: { id }, data: { isActive } });
  }

  /**
   * Creating, activating and deactivating a tenant are platform governance
   * actions - a tenant must never be able to perform them on itself, even if
   * a role were ever misconfigured to grant the permission.
   */
  private assertPlatformLevel(caller: AuthenticatedUser, action: string): void {
    if (caller.tenantId !== null) {
      throw new ForbiddenException(`Only platform-level callers can ${action}`);
    }
  }
}
