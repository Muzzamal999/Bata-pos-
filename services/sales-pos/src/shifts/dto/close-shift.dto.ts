import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CloseShiftDto {
  @ApiProperty({ description: 'Physically counted cash in the drawer at close' })
  @IsNumber()
  @Min(0)
  closingCash!: number;
}
