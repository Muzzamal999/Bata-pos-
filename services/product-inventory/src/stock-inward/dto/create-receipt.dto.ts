import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReceiptDto {
  @ApiProperty({ format: 'uuid', description: 'Service 1 branch receiving the stock.' })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({ example: 'PO-2026-0042' })
  @IsOptional()
  @IsString()
  supplierReference?: string;
}
