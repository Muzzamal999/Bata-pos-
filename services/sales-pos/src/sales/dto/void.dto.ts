import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class VoidSaleDto {
  @ApiProperty({
    description:
      'Client-supplied key. Replaying the same key returns the original void instead of restocking twice.',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
