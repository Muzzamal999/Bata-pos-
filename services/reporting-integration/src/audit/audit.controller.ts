import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantScope } from '../common/utils/tenant-scope.util';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Read-only by design: no update or delete endpoint exists here, for anyone,
 * including administrators. Audit history is immutable.
 */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@RequirePermissions(PERMISSIONS.AUDIT_READ)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    const tenantId = requireTenantScope(user, query.tenantId);
    return this.audit.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.audit.findOne(user, id);
  }
}
