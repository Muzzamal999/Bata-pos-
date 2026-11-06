import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Audited('branch.create', 'Branch')
  @RequirePermissions(PERMISSIONS.BRANCHES_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListBranchesQueryDto) {
    return this.branchesService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.findOne(caller, id);
  }

  @Audited('branch.update', 'Branch')
  @RequirePermissions(PERMISSIONS.BRANCHES_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(caller, id, dto);
  }

  @Audited('branch.activate', 'Branch')
  @RequirePermissions(PERMISSIONS.BRANCHES_ACTIVATE)
  @Patch(':id/activate')
  activate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.setActive(caller, id, true);
  }

  @Audited('branch.deactivate', 'Branch')
  @RequirePermissions(PERMISSIONS.BRANCHES_DEACTIVATE)
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.branchesService.setActive(caller, id, false);
  }
}
