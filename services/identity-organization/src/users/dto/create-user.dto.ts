import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiPropertyOptional({
    description:
      'Only honored for platform-level callers; tenant-scoped callers are pinned to their own tenant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'cashier@bata.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;
}
