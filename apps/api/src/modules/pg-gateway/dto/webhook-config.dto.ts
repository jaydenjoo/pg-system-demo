// ============================================================
// PG Gateway — 웹훅 설정 업데이트 DTO
// ============================================================
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWebhookConfigDto {
  @ApiProperty({
    description: '웹훅 수신 URL (HTTPS만 허용)',
    example: 'https://example.com/webhook',
  })
  /** 웹훅 수신 URL (HTTPS만 허용) */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsNotEmpty()
  @MaxLength(512)
  webhookUrl!: string;

  @ApiProperty({
    description: 'HMAC-SHA256 서명용 시크릿 키 (최소 32자)',
    example: 'your-secret-key-here-min-32-chars-long',
  })
  /**
   * HMAC-SHA256 서명용 시크릿 키.
   * 가맹점이 직접 생성하여 전달. 최소 32자.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  webhookSecret!: string;
}
