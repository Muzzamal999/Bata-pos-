import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(320)
  recipient!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  body!: string;
}
