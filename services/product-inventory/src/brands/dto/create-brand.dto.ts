import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBrandDto {
  @ApiPropertyOptional({
    description:
      'Only honored for platform-level callers; tenant-scoped callers are pinned to their own tenant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'BATA' })
  @IsString()
  @MinLength(2)
  name!: string;
}
