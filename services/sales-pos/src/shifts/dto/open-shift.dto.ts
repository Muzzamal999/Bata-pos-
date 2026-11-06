import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenShiftDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Starting cash in the drawer' })
  @IsNumber()
  @Min(0)
  openingFloat!: number;
}
