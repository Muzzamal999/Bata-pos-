import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PricingService } from './pricing.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { ListPricesQueryDto } from './dto/list-prices-query.dto';
import { ResolvePriceQueryDto } from './dto/resolve-price-query.dto';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @RequirePermissions(PERMISSIONS.PRICING_CREATE)
  @Post('prices')
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreatePriceDto) {
    return this.pricingService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.PRICING_READ)
  @Get('prices')
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListPricesQueryDto) {
    return this.pricingService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.PRICING_READ)
  @Get('prices/resolve')
  resolve(@CurrentUser() caller: AuthenticatedUser, @Query() query: ResolvePriceQueryDto) {
    return this.pricingService.resolveCurrentPrice(caller, query);
  }

  @RequirePermissions(PERMISSIONS.PRICING_READ)
  @Get('prices/:id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.findOne(caller, id);
  }

  @RequirePermissions(PERMISSIONS.PRICING_UPDATE)
  @Patch('prices/:id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.pricingService.update(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.PRICING_READ)
  @Get('prices/:id/history')
  getHistory(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.getHistory(caller, id);
  }
}
