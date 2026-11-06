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
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { AddProductImageDto } from './dto/add-product-image.dto';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  @Post()
  create(@CurrentUser() caller: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(caller, dto);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @Get()
  findAll(@CurrentUser() caller: AuthenticatedUser, @Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(caller, query);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @Get(':id')
  findOne(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(caller, id);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_ACTIVATE)
  @Patch(':id/activate')
  activate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.setActive(caller, id, true);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_DEACTIVATE)
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() caller: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.setActive(caller, id, false);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Post(':id/images')
  addImage(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProductImageDto,
  ) {
    return this.productsService.addImage(caller, id, dto);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/images/:imageId')
  removeImage(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.productsService.removeImage(caller, id, imageId);
  }
}
