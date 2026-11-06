import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ example: '42' })
  @IsString()
  @MinLength(1)
  size!: string;

  @ApiProperty({ example: 'Black' })
  @IsString()
  @MinLength(1)
  color!: string;

  @ApiPropertyOptional({
    description: 'Auto-generated from article number + size + color if omitted.',
    example: 'BATA-OX-001-42-BLACK',
  })
  @IsOptional()
  @IsString()
  sku?: string;
}
