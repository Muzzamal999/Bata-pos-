import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertTenantAccess } from '../common/utils/tenant-scope.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const entry = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, entry.tenantId);
    return entry;
  }
}
