import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsPositive } from 'class-validator';

export class RecordCashMovementDto {
  @ApiProperty({ enum: ['CASH_IN', 'CASH_OUT'] })
  @IsIn(['CASH_IN', 'CASH_OUT'])
  type!: 'CASH_IN' | 'CASH_OUT';

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
