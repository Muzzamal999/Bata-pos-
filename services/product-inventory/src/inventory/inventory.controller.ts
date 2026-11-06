import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InventoryService } from './inventory.service';
import { RecordMovementDto } from './dto/record-movement.dto';
import { RecordAdjustmentDto } from './dto/record-adjustment.dto';
import { ListBalancesQueryDto } from './dto/list-balances-query.dto';
import { ListLedgerQueryDto } from './dto/list-ledger-query.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequirePermissions(PERMISSIONS.INVENTORY_STOCK_IN)
  @Post('stock-in')
  stockIn(@CurrentUser() caller: AuthenticatedUser, @Body() dto: RecordMovementDto) {
    return this.inventoryService.stockIn(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_STOCK_OUT)
  @Post('stock-out')
  stockOut(@CurrentUser() caller: AuthenticatedUser, @Body() dto: RecordMovementDto) {
    return this.inventoryService.stockOut(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_MARK_DAMAGED)
  @Post('damage')
  markDamaged(@CurrentUser() caller: AuthenticatedUser, @Body() dto: RecordMovementDto) {
    return this.inventoryService.markDamaged(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Post('adjustments')
  adjust(@CurrentUser() caller: AuthenticatedUser, @Body() dto: RecordAdjustmentDto) {
    return this.inventoryService.adjust(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @Get('balances')
  listBalances(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListBalancesQueryDto) {
    return this.inventoryService.listBalances(caller, query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @Get('ledger')
  listLedger(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListLedgerQueryDto) {
    return this.inventoryService.listLedger(caller, query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Patch('thresholds')
  setThreshold(@CurrentUser() caller: AuthenticatedUser, @Body() dto: SetThresholdDto) {
    return this.inventoryService.setThreshold(caller, dto);
  }
}
