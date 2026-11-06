import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReasonDto } from './dto/reason.dto';
import { TransferLineQuantitiesDto } from './dto/transfer-line-quantities.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @RequirePermissions(PERMISSIONS.TRANSFERS_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateTransferDto) {
    return this.transfersService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListTransfersQueryDto) {
    return this.transfersService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.findOne(caller, id);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_REQUEST)
  @Post(':id/request')
  request(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.request(caller, id);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_APPROVE)
  @Post(':id/approve')
  approve(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.approve(caller, id);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_REJECT)
  @Post(':id/reject')
  reject(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.transfersService.reject(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_CANCEL)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.transfersService.cancel(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_DISPATCH)
  @Post(':id/dispatch')
  dispatch(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferLineQuantitiesDto,
  ) {
    return this.transfersService.dispatch(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_MARK_IN_TRANSIT)
  @Post(':id/mark-in-transit')
  markInTransit(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfersService.markInTransit(caller, id);
  }

  @RequirePermissions(PERMISSIONS.TRANSFERS_RECEIVE)
  @Post(':id/receive')
  receive(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferLineQuantitiesDto,
  ) {
    return this.transfersService.receive(caller, id, dto);
  }
}
