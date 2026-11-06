import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Platform-level callers only; tenant-scoped callers are pinned to their own tenant',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date-time, inclusive lower bound on occurredAt' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date-time, inclusive upper bound on occurredAt' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SalesReportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly'], default: 'daily' })
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  period?: 'daily' | 'weekly' | 'monthly' = 'daily';
}

export class StockMovementsQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
