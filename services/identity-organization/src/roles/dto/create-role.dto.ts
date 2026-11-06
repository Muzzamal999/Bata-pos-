import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @ApiPropertyOptional({
    description:
      'Only honored for platform-level callers; tenant-scoped callers are pinned to their own tenant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'Regional Supervisor' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
