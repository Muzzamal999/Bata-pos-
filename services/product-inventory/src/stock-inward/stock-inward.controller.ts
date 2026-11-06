import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StockInwardService } from './stock-inward.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { AddLineDto } from './dto/add-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';

@ApiTags('stock-inward')
@ApiBearerAuth()
@Controller('stock-inward')
export class StockInwardController {
  constructor(private readonly stockInwardService: StockInwardService) {}

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateReceiptDto) {
    return this.stockInwardService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListReceiptsQueryDto) {
    return this.stockInwardService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockInwardService.findOne(caller, id);
  }

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_UPDATE)
  @Post(':id/lines')
  addLine(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddLineDto,
  ) {
    return this.stockInwardService.addLine(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_UPDATE)
  @Patch(':id/lines/:lineId')
  updateLine(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateLineDto,
  ) {
    return this.stockInwardService.updateLine(caller, id, lineId, dto);
  }

  @RequirePermissions(PERMISSIONS.STOCK_INWARD_CONFIRM)
  @Post(':id/confirm')
  confirm(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmReceiptDto,
  ) {
    return this.stockInwardService.confirm(caller, id, dto);
  }
}
