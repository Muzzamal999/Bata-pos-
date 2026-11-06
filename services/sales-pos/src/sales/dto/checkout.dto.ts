import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscount?: number;
}

export class CheckoutPaymentDto {
  @ApiProperty({ enum: ['CASH', 'CARD', 'MOBILE_WALLET', 'OTHER'] })
  @IsIn(['CASH', 'CARD', 'MOBILE_WALLET', 'OTHER'])
  method!: 'CASH' | 'CARD' | 'MOBILE_WALLET' | 'OTHER';

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Defaults to the caller's own currently open shift, if any.",
  })
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiProperty({
    description:
      'Client-supplied key. Replaying the same key returns the original sale instead of charging/deducting stock twice.',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiProperty({ type: [CheckoutLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @ApiProperty({ type: [CheckoutPaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments!: CheckoutPaymentDto[];

  @ApiPropertyOptional({
    default: 0,
    description: 'Header-level discount, on top of any line discounts',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountTotal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxTotal?: number;
}
