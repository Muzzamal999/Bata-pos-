import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Bearer } from '../common/decorators/bearer.decorator';
import { SalesService } from './sales.service';
import { CheckoutDto } from './dto/checkout.dto';
import { RefundDto } from './dto/refund.dto';
import { VoidSaleDto } from './dto/void.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @Post()
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
    @Bearer() bearerToken: string,
  ) {
    return this.sales.checkout(user, dto, bearerToken);
  }

  @RequirePermissions(PERMISSIONS.SALES_READ)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.findOne(user, id);
  }

  @RequirePermissions(PERMISSIONS.SALES_REFUND)
  @Post(':id/refund')
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundDto,
    @Bearer() bearerToken: string,
  ) {
    return this.sales.refund(user, id, dto, bearerToken);
  }

  @RequirePermissions(PERMISSIONS.SALES_VOID)
  @Post(':id/void')
  void(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSaleDto,
    @Bearer() bearerToken: string,
  ) {
    return this.sales.void(user, id, dto.idempotencyKey, bearerToken, dto.reason);
  }
}
