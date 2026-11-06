import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { requireTenantScope } from '../common/utils/tenant-scope.util';
import { Bearer } from '../common/decorators/bearer.decorator';
import { CatalogService } from './catalog.service';
import { BarcodeLookupQueryDto, CatalogSearchQueryDto } from './dto/catalog-query.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions(PERMISSIONS.CATALOG_READ)
  @Get('lookup')
  async lookupByBarcode(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BarcodeLookupQueryDto,
  ) {
    const tenantId = requireTenantScope(user);
    const entry = await this.catalog.lookupByBarcode(tenantId, query.barcode);
    return entry ? { found: true, entry } : { found: false };
  }

  @RequirePermissions(PERMISSIONS.CATALOG_READ)
  @Get('search')
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: CatalogSearchQueryDto) {
    const tenantId = requireTenantScope(user);
    return this.catalog.search(tenantId, query.query);
  }

  @RequirePermissions(PERMISSIONS.CATALOG_SYNC)
  @Post('sync')
  async sync(@CurrentUser() user: AuthenticatedUser, @Bearer() bearerToken: string) {
    const tenantId = requireTenantScope(user);
    const synced = await this.catalog.syncFromProductInventory(tenantId, bearerToken);
    return { synced };
  }
}
