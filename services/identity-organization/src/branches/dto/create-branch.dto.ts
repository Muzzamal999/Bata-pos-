import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBranchDto {
  @ApiPropertyOptional({
    description:
      'Only honored for platform-level callers; tenant-scoped callers are pinned to their own tenant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'Gulberg Branch' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'GULBERG-01' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
