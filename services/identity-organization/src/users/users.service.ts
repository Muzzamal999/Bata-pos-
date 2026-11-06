import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertTenantAccess, resolveTenantScope } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignBranchDto } from './dto/assign-branch.dto';

const USER_SAFE_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(caller: AuthenticatedUser, dto: CreateUserDto) {
    const tenantId = resolveTenantScope(caller, dto.tenantId ?? null);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists in this tenant');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: USER_SAFE_SELECT,
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListUsersQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = resolveTenantScope(caller, query.tenantId ?? null);
    const where = tenantId === null && caller.tenantId === null ? {} : { tenantId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
    if (!user) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, user.tenantId);
    return user;
  }

  async update(caller: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    await this.findOne(caller, id);

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SAFE_SELECT,
    });
  }

  async setActive(caller: AuthenticatedUser, id: string, isActive: boolean) {
    await this.findOne(caller, id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SAFE_SELECT,
    });
  }

  async assignRole(caller: AuthenticatedUser, userId: string, dto: AssignRoleDto) {
    const user = await this.findOne(caller, userId);

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.tenantId !== null && role.tenantId !== user.tenantId) {
      throw new BadRequestException("Role does not belong to this user's tenant");
    }

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: dto.roleId } },
      create: { userId, roleId: dto.roleId },
      update: {},
    });
  }

  async removeRole(caller: AuthenticatedUser, userId: string, roleId: string) {
    await this.findOne(caller, userId);
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  async assignBranch(caller: AuthenticatedUser, userId: string, dto: AssignBranchDto) {
    const user = await this.findOne(caller, userId);

    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.tenantId !== user.tenantId) {
      throw new BadRequestException("Branch does not belong to this user's tenant");
    }

    await this.prisma.userBranch.upsert({
      where: { userId_branchId: { userId, branchId: dto.branchId } },
      create: { userId, branchId: dto.branchId, isPrimary: dto.isPrimary ?? false },
      update: { isPrimary: dto.isPrimary ?? false },
    });
  }

  async removeBranch(caller: AuthenticatedUser, userId: string, branchId: string) {
    await this.findOne(caller, userId);
    await this.prisma.userBranch.deleteMany({ where: { userId, branchId } });
  }
}
