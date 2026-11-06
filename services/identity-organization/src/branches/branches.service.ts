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
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthenticatedUser, dto: CreateBranchDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);
    if (tenantId === null) {
      // Only reachable for a platform-level caller who didn't specify a
      // tenantId - unlike Role, a Branch always belongs to exactly one tenant.
      throw new BadRequestException('tenantId is required to create a branch');
    }

    const existing = await this.prisma.branch.findFirst({ where: { tenantId, code: dto.code } });
    if (existing) {
      throw new ConflictException('A branch with this code already exists in this tenant');
    }

    return this.prisma.branch.create({
      data: { tenantId, name: dto.name, code: dto.code, address: dto.address },
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListBranchesQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);
    const where = tenantId === null ? {} : { tenantId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, branch.tenantId);
    return branch;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateBranchDto) {
    const branch = await this.findOne(caller, id);

    if (dto.code) {
      const existing = await this.prisma.branch.findFirst({
        where: { tenantId: branch.tenantId, code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('A branch with this code already exists in this tenant');
      }
    }

    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  async setActive(caller: AuthenticatedUser, id: string, isActive: boolean) {
    await this.findOne(caller, id);
    return this.prisma.branch.update({ where: { id }, data: { isActive } });
  }
}
