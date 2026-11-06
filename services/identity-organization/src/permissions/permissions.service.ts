import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException('A permission with this code already exists');
    }
    return this.prisma.permission.create({ data: dto });
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResultDto<unknown>> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        skip: query.skip,
        take: query.limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.permission.count(),
    ]);
    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) {
      throw new NotFoundException();
    }
    return permission;
  }

  async update(id: string, dto: UpdatePermissionDto) {
    await this.findOne(id);
    return this.prisma.permission.update({ where: { id }, data: dto });
  }
}
