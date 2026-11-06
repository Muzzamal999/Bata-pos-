import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'BATA Footwear' })
  @IsString()
  @MinLength(2)
  name!: string;
}
