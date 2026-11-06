import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class UpdateLineDto {
  @ApiProperty({ example: 60 })
  @IsInt()
  @IsPositive()
  expectedQty!: number;
}
