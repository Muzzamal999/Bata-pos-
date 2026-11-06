import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { StockInwardStatus } from '../../generated/prisma/enums';

export class ListReceiptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ enum: StockInwardStatus })
  @IsOptional()
  @IsEnum(StockInwardStatus)
  status?: StockInwardStatus;
}
