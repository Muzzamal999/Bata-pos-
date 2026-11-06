import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransferLineQuantityDto {
  @IsUUID()
  lineId!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}

/** Shared shape for dispatch/receive: omit `lines` to use the default quantity for every line. */
export class TransferLineQuantitiesDto {
  @ApiPropertyOptional({ type: [TransferLineQuantityDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineQuantityDto)
  lines?: TransferLineQuantityDto[];
}
