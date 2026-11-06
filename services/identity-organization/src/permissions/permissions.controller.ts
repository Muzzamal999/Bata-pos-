import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Audited('permission.create', 'Permission')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_CREATE)
  @Post()
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionsService.findAll(query);
  }

  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id);
  }

  @Audited('permission.update', 'Permission')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_UPDATE)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }
}
