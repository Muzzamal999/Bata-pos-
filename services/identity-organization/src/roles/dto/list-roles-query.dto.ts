import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListRolesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Only honored for platform-level callers.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
