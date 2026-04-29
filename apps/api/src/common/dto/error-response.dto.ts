// ============================================================
// 공통 에러 응답 DTO — Swagger 문서 스키마용
// ============================================================
import { ApiProperty } from '@nestjs/swagger';

/** 에러 상세 정보 */
class ErrorDetail {
  @ApiProperty({
    description: '에러 코드 (도메인별 식별자)',
    example: 'PGW_PAYMENT_NOT_FOUND',
  })
  code!: string;

  @ApiProperty({
    description: '에러 메시지 (사람이 읽을 수 있는 설명)',
    example: '결제 건을 찾을 수 없습니다',
  })
  message!: string;
}

/** API 에러 응답 공통 형식 */
export class ErrorResponseDto {
  @ApiProperty({ description: '요청 성공 여부', example: false })
  success!: false;

  @ApiProperty({ description: '에러 상세', type: ErrorDetail })
  error!: ErrorDetail;
}
