import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class RecordMovementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ format: 'uuid', description: 'The Service 1 branch this stock is held at.' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    example: 10,
    description: 'Always a positive count; direction is implied by the endpoint.',
  })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ example: 'Manual recount' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    description:
      'Client-supplied key. Replaying the same key returns the original result instead of applying the movement twice.',
    example: 'a1b2c3d4-...',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
