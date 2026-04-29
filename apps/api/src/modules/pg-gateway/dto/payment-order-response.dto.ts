// ============================================================
// PG Gateway — 결제 주문 응답 DTO (DB 엔티티 → API 응답 변환)
// ============================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { pg_payment_orders } from '@prisma/client';
import type {
  PaymentOrderResponse,
  PgCardPaymentDetail,
  PgVirtualAccountDetail,
} from '@pg-system/shared';
import type { PaymentMethodCode, PgPaymentStatusCode } from '@pg-system/shared';

/** 결제 주문 응답 스키마 (Swagger 문서 + 팩토리) */
export class PaymentOrderResponseDto {
  @ApiProperty({ description: '결제 키 (UUID)', example: '550e8400-e29b-41d4-a716-446655440000' })
  paymentKey!: string;

  @ApiProperty({ description: '주문번호 (가맹점 생성)', example: 'ORDER-20250302-001' })
  orderId!: string;

  @ApiProperty({ description: '주문명', example: '테스트 상품 결제' })
  orderName!: string;

  @ApiProperty({
    description: '결제 상태',
    example: 'APPROVED',
    enum: ['READY', 'APPROVED', 'CANCELLED', 'FAILED', 'EXPIRED'],
  })
  status!: string;

  @ApiProperty({ description: '결제 금액 (원 단위)', example: 10000 })
  amount!: number;

  @ApiPropertyOptional({
    description: '결제 수단',
    example: 'CARD',
    enum: ['CARD', 'VIRTUAL_ACCOUNT', 'TRANSFER'],
  })
  paymentMethod!: string | null;

  @ApiPropertyOptional({
    description: '승인 시각 (ISO 8601)',
    example: '2025-03-02T15:30:00.000Z',
  })
  approvedAt!: string | null;

  @ApiProperty({ description: '요청 시각 (ISO 8601)', example: '2025-03-02T15:00:00.000Z' })
  requestedAt!: string;

  @ApiPropertyOptional({ description: '카드 결제 상세 (카드 결제 시)', nullable: true })
  card!: PgCardPaymentDetail | null;

  @ApiPropertyOptional({ description: '가상계좌 상세 (가상계좌 결제 시)', nullable: true })
  virtualAccount!: PgVirtualAccountDetail | null;

  /**
   * DB 엔티티 → PaymentOrderResponse 변환 팩토리
   * - BigInt amount → number
   * - Date → ISO string
   * - card 정보는 Phase 4에서 실제 연결 (현재 null)
   */
  static fromEntity(
    entity: pg_payment_orders,
    card: PgCardPaymentDetail | null = null,
    virtualAccount: PgVirtualAccountDetail | null = null,
  ): PaymentOrderResponse {
    return {
      paymentKey: entity.payment_key,
      orderId: entity.order_id,
      orderName: entity.order_name,
      status: entity.status as PgPaymentStatusCode,
      amount: Number(entity.amount),
      paymentMethod: (entity.payment_method as PaymentMethodCode) ?? null,
      approvedAt: entity.approved_at?.toISOString() ?? null,
      requestedAt: entity.created_at.toISOString(),
      card,
      virtualAccount,
    };
  }
}
