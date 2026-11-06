import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AddBarcodeDto {
  @ApiProperty({ example: '0123456789012' })
  @IsString()
  @MinLength(4)
  code!: string;
}
