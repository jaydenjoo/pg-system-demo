// ============================================================
// PG Gateway — 웹훅 테스트 발송 응답 DTO
// ============================================================
import { ApiProperty } from '@nestjs/swagger';

export class WebhookTestResponseDto {
  @ApiProperty({ description: '테스트 발송 성공 여부' })
  success!: boolean;

  @ApiProperty({ description: 'HTTP 응답 코드 (null = 네트워크 에러)', nullable: true })
  statusCode!: number | null;

  @ApiProperty({ description: '응답 시간 (ms)' })
  responseTimeMs!: number;

  @ApiProperty({ description: '에러 메시지 (실패 시)', nullable: true })
  message!: string | null;
}
