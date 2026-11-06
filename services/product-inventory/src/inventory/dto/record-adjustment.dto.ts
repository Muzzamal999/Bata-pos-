import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MinLength, NotEquals } from 'class-validator';

export class RecordAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    example: -2,
    description:
      'Signed delta applied directly to on-hand quantity (positive or negative, never zero).',
  })
  @IsInt()
  @NotEquals(0)
  quantityDelta!: number;

  @ApiPropertyOptional({ example: 'Cycle count correction' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ description: 'Client-supplied key, see RecordMovementDto.' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
