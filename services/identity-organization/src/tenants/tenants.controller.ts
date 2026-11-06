import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Audited('tenant.create', 'Tenant')
  @RequirePermissions(PERMISSIONS.TENANTS_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.tenantsService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.TENANTS_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(caller, id);
  }

  @Audited('tenant.update', 'Tenant')
  @RequirePermissions(PERMISSIONS.TENANTS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(caller, id, dto);
  }

  @Audited('tenant.activate', 'Tenant')
  @RequirePermissions(PERMISSIONS.TENANTS_ACTIVATE)
  @Patch(':id/activate')
  activate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.setActive(caller, id, true);
  }

  @Audited('tenant.deactivate', 'Tenant')
  @RequirePermissions(PERMISSIONS.TENANTS_DEACTIVATE)
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.setActive(caller, id, false);
  }
}
