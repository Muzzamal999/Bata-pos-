import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Audited('role.create', 'Role')
  @RequirePermissions(PERMISSIONS.ROLES_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListRolesQueryDto) {
    return this.rolesService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(caller, id);
  }

  @Audited('role.update', 'Role')
  @RequirePermissions(PERMISSIONS.ROLES_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(caller, id, dto);
  }

  @Audited('role.delete', 'Role')
  @RequirePermissions(PERMISSIONS.ROLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(caller, id);
  }

  @Audited('role.assign_permission', 'Role')
  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/permissions')
  assignPermission(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionDto,
  ) {
    return this.rolesService.assignPermission(caller, id, dto);
  }

  @Audited('role.remove_permission', 'Role')
  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/permissions/:permissionId')
  removePermission(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
  ) {
    return this.rolesService.removePermission(caller, id, permissionId);
  }
}
