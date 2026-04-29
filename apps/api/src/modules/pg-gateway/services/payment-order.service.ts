// ============================================================
// PG Gateway — 결제 주문 서비스
// ============================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { pg_payment_orders } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES } from '@pg-system/shared';
import type { PaymentOrderResponse } from '@pg-system/shared';
import type { CreatePaymentOrderDto } from '../dto/create-payment-order.dto';
import { PaymentOrderResponseDto } from '../dto/payment-order-response.dto';

/** 결제 세션 만료 시간 (30분) */
const PAYMENT_EXPIRES_MINUTES = 30;

@Injectable()
export class PaymentOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 결제 주문 생성.
   * payment_key는 DB gen_random_uuid() 기본값으로 생성 — 서비스에서 생성하지 않음.
   * expires_at = 현재시간 + 30분.
   */
  async createPaymentOrder(
    dto: CreatePaymentOrderDto,
    merchantId: string,
    apiKeyId: string,
  ): Promise<PaymentOrderResponse> {
    // 금액 검증: 양수 정수만 허용 (소수점 금지)
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_002,
        message: '결제 금액이 올바르지 않습니다',
      });
    }

    const expiresAt = new Date(Date.now() + PAYMENT_EXPIRES_MINUTES * 60 * 1000);

    try {
      const order = await this.prisma.pg_payment_orders.create({
        data: {
          merchant_id: merchantId,
          api_key_id: apiKeyId,
          order_id: dto.orderId,
          amount: BigInt(dto.amount),
          order_name: dto.orderName,
          payment_method: dto.paymentMethod ?? null,
          customer_email: dto.customerEmail ?? null,
          customer_name: dto.customerName ?? null,
          success_url: dto.successUrl ?? null,
          fail_url: dto.failUrl ?? null,
          expires_at: expiresAt,
        },
      });

      return this.toResponse(order);
    } catch (e: unknown) {
      // order_id + merchant_id 복합 유니크 제약 위반 (Prisma P2002)
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException({
          code: ERROR_CODES.VALIDATION_001,
          message: '이미 존재하는 주문 ID입니다',
        });
      }
      throw e;
    }
  }

  /**
   * payment_key + merchantId로 결제 주문 조회.
   * @@unique([payment_key, merchant_id]) 복합 유니크 인덱스로 DB 레벨 원자적 검증.
   */
  async getByPaymentKey(
    paymentKey: string,
    merchantId: string,
  ): Promise<PaymentOrderResponse> {
    const order = await this.prisma.pg_payment_orders.findUnique({
      where: { uq_payment_key_merchant: { payment_key: paymentKey, merchant_id: merchantId } },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    return this.toResponse(order);
  }

  /**
   * orderId + merchantId로 결제 주문 조회.
   * @@unique([order_id, merchant_id]) 복합 유니크 인덱스 활용.
   */
  async getByOrderId(
    orderId: string,
    merchantId: string,
  ): Promise<PaymentOrderResponse> {
    const order = await this.prisma.pg_payment_orders.findUnique({
      where: { uq_order_merchant: { order_id: orderId, merchant_id: merchantId } },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    return this.toResponse(order);
  }

  /** DB 엔티티 → PaymentOrderResponse 변환 (card는 Phase 4에서 연결) */
  private toResponse(entity: pg_payment_orders): PaymentOrderResponse {
    return PaymentOrderResponseDto.fromEntity(entity, null);
  }
}
