import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RefundLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  saleLineId!: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class RefundDto {
  @ApiProperty({
    description:
      'Client-supplied key. Replaying the same key returns the original refund instead of restocking/crediting twice.',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiProperty({ type: [RefundLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  lines!: RefundLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
