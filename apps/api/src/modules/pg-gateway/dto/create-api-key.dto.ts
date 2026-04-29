import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    description: '가맹점 ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantId!: string;

  @ApiPropertyOptional({
    description: '웹훅 수신 URL (HTTP/HTTPS)',
    example: 'https://example.com/webhook',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(512)
  webhookUrl?: string;

  @ApiPropertyOptional({
    description: 'HMAC-SHA256 서명용 시크릿 키',
    example: 'your-secret-key-here-min-32-chars-long',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  webhookSecret?: string;
}
