import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'reports.export', description: 'dot.separated resource.action code' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, {
    message: 'code must look like "resource.action" (lowercase, dot-separated)',
  })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
