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
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { VariantsService } from './variants.service';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { AddBarcodeDto } from './dto/add-barcode.dto';

@ApiTags('variants')
@ApiBearerAuth()
@Controller()
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @RequirePermissions(PERMISSIONS.VARIANTS_CREATE)
  @Post('products/:productId/variants')
  create(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variantsService.create(caller, productId, dto);
  }

  @RequirePermissions(PERMISSIONS.VARIANTS_READ)
  @Get('products/:productId/variants')
  findAllForProduct(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.variantsService.findAllForProduct(caller, productId, query);
  }

  @RequirePermissions(PERMISSIONS.VARIANTS_READ)
  @Get('variants/:id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.variantsService.findOne(caller, id);
  }

  @RequirePermissions(PERMISSIONS.VARIANTS_UPDATE)
  @Patch('variants/:id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantsService.update(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.VARIANTS_ACTIVATE)
  @Patch('variants/:id/activate')
  activate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.variantsService.setActive(caller, id, true);
  }

  @RequirePermissions(PERMISSIONS.VARIANTS_DEACTIVATE)
  @Patch('variants/:id/deactivate')
  deactivate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.variantsService.setActive(caller, id, false);
  }

  @RequirePermissions(PERMISSIONS.BARCODES_CREATE)
  @Post('variants/:id/barcodes')
  addBarcode(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBarcodeDto,
  ) {
    return this.variantsService.addBarcode(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.BARCODES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('variants/:id/barcodes/:barcodeId')
  removeBarcode(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
  ) {
    return this.variantsService.removeBarcode(caller, id, barcodeId);
  }
}
