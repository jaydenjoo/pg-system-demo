// ============================================================
// PG Gateway — 결제창 검증 요청/응답 DTO
// clientKey(공개키)로 paymentKey 유효성 확인 (SDK 클라이언트 사이드용)
// ============================================================
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** GET /pg/v1/payments/checkout/verify 요청 Query */
export class VerifyCheckoutQueryDto {
  @ApiProperty({
    description: '결제 키 (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  paymentKey!: string;

  @ApiProperty({
    description: '가맹점 공개 키 (ck_live_xxx)',
    example: 'ck_live_abc123def456',
  })
  @IsString()
  @IsNotEmpty()
  clientKey!: string;
}

/** 결제창 검증 응답 */
export class VerifyCheckoutResponseDto {
  @ApiProperty({ description: '결제 키' })
  paymentKey!: string;

  @ApiProperty({ description: '주문 ID' })
  orderId!: string;

  @ApiProperty({ description: '주문명' })
  orderName!: string;

  @ApiProperty({ description: '결제 금액 (원)' })
  amount!: number;

  @ApiProperty({ description: '결제 상태' })
  status!: string;

  @ApiProperty({ description: '가맹점명' })
  merchantName!: string;
}
