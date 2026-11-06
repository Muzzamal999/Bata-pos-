import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class BarcodeLookupQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  barcode!: string;
}

export class CatalogSearchQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  query!: string;
}
