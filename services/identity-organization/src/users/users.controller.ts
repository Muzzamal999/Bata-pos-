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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignBranchDto } from './dto/assign-branch.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Audited('user.create', 'User')
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(caller, id);
  }

  @Audited('user.update', 'User')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(caller, id, dto);
  }

  @Audited('user.activate', 'User')
  @RequirePermissions(PERMISSIONS.USERS_ACTIVATE)
  @Patch(':id/activate')
  activate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setActive(caller, id, true);
  }

  @Audited('user.deactivate', 'User')
  @RequirePermissions(PERMISSIONS.USERS_DEACTIVATE)
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setActive(caller, id, false);
  }

  @Audited('user.assign_role', 'User')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/roles')
  assignRole(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.usersService.assignRole(caller, id, dto);
  }

  @Audited('user.remove_role', 'User')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/roles/:roleId')
  removeRole(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.usersService.removeRole(caller, id, roleId);
  }

  @Audited('user.assign_branch', 'User')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_BRANCH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/branches')
  assignBranch(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBranchDto,
  ) {
    return this.usersService.assignBranch(caller, id, dto);
  }

  @Audited('user.remove_branch', 'User')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_BRANCH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/branches/:branchId')
  removeBranch(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.usersService.removeBranch(caller, id, branchId);
  }
}
