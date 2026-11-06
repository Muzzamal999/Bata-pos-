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

export class ConfirmReceiptLineDto {
  @IsUUID()
  lineId!: string;

  @IsInt()
  @Min(0)
  receivedQty!: number;
}

export class ConfirmReceiptDto {
  @ApiPropertyOptional({
    description:
      'Per-line received quantities, for partial receipts. Omit to receive every line in full.',
    type: [ConfirmReceiptLineDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmReceiptLineDto)
  lines?: ConfirmReceiptLineDto[];
}
