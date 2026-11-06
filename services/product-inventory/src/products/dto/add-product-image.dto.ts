import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUrl, Min } from 'class-validator';

export class AddProductImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/products/bata-ox-001.jpg' })
  @IsUrl()
  url!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
