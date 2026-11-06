import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreatePriceDto {
  @ApiPropertyOptional({
    description: 'Exactly one of productId/variantId is required.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Exactly one of productId/variantId is required.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Branch to override the tenant-wide price for. Omit for a tenant-wide default.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({
    description: 'Tax-exclusive base price. Tax policy is applied elsewhere, not stored here.',
    example: 2499.0,
  })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ default: 'PKR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
