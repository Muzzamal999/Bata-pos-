import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess, resolveTenantScope } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthenticatedUser, dto: CreateRoleDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);

    const existing = await this.prisma.role.findFirst({ where: { tenantId, name: dto.name } });
    if (existing) {
      throw new ConflictException('A role with this name already exists in this scope');
    }

    return this.prisma.role.create({
      data: { tenantId, name: dto.name, description: dto.description, isSystem: false },
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListRolesQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);
    // Global/system roles (tenantId null) are shared templates visible to every tenant.
    const where = tenantId === null ? {} : { OR: [{ tenantId }, { tenantId: null }] };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException();
    }
    // Global roles are readable by anyone; tenant-owned ones follow normal isolation.
    if (role.tenantId !== null) {
      assertTenantAccess(caller, role.tenantId);
    }
    return role;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(caller, id);
    this.assertMutable(caller, role);

    if (dto.name) {
      const existing = await this.prisma.role.findFirst({
        where: { tenantId: role.tenantId, name: dto.name, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('A role with this name already exists in this scope');
      }
    }

    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(caller: AuthenticatedUser, id: string): Promise<void> {
    const role = await this.findOne(caller, id);
    this.assertMutable(caller, role);
    await this.prisma.role.delete({ where: { id } });
  }

  async assignPermission(caller: AuthenticatedUser, roleId: string, dto: AssignPermissionDto) {
    const role = await this.findOne(caller, roleId);
    this.assertCanManagePermissions(caller, role);

    const permission = await this.prisma.permission.findUnique({
      where: { id: dto.permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: dto.permissionId } },
      create: { roleId, permissionId: dto.permissionId },
      update: {},
    });
  }

  async removePermission(
    caller: AuthenticatedUser,
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    const role = await this.findOne(caller, roleId);
    this.assertCanManagePermissions(caller, role);
    await this.prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  }

  /** Renaming/deleting a role is blocked for system roles, and for global roles unless the caller is platform-level. */
  private assertMutable(
    caller: AuthenticatedUser,
    role: { tenantId: string | null; isSystem: boolean },
  ) {
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be modified or deleted');
    }
    if (role.tenantId === null && caller.tenantId !== null) {
      throw new ForbiddenException('Only platform-level callers can modify global roles');
    }
  }

  /** Permission assignment is allowed on system roles (expanding what they grant), but only by platform-level callers when the role is global. */
  private assertCanManagePermissions(caller: AuthenticatedUser, role: { tenantId: string | null }) {
    if (role.tenantId === null && caller.tenantId !== null) {
      throw new ForbiddenException('Only platform-level callers can manage global roles');
    }
  }
}
