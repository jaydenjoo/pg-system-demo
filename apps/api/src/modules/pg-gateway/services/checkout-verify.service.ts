// ============================================================
// PG Gateway — 결제창 검증 서비스
// clientKey(공개키)로 paymentKey 유효성을 확인.
// secretKey 불필요 — SDK 클라이언트 사이드에서 호출하는 엔드포인트.
// @security PCI DSS 6.5 — 결제 데이터 무결성 검증
// ============================================================
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES } from '@pg-system/shared';

/** 검증 성공 시 반환하는 결제 정보 (카드 데이터 절대 미포함) */
export interface CheckoutVerifyResult {
  paymentKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  status: string;
  merchantName: string;
}

@Injectable()
export class CheckoutVerifyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * clientKey + paymentKey로 결제 건 유효성 검증.
   * 1) clientKey로 pg_api_keys 조회 → merchantId 특정
   * 2) paymentKey + merchantId로 결제 건 조회
   * 3) 결제 상태가 READY인 경우만 결제창 표시 허용
   */
  async verify(
    clientKey: string,
    paymentKey: string,
  ): Promise<CheckoutVerifyResult> {
    // 1. clientKey로 API 키 조회 (활성 상태만)
    const apiKey = await this.prisma.pg_api_keys.findFirst({
      where: { client_key: clientKey, is_active: true },
    });
    if (!apiKey) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_001,
        message: '유효하지 않은 클라이언트 키입니다',
      });
    }

    // 2. paymentKey + merchantId로 결제 건 조회
    const order = await this.prisma.pg_payment_orders.findFirst({
      where: {
        payment_key: paymentKey,
        merchant_id: apiKey.merchant_id,
      },
    });
    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 건을 찾을 수 없습니다',
      });
    }

    // 3. READY 상태만 결제창 표시 허용
    if (order.status !== 'READY') {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_003,
        message: '이미 처리된 결제입니다',
      });
    }

    // 4. 만료 시간 확인
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_004,
        message: '결제 시간이 만료되었습니다',
      });
    }

    // 5. 가맹점명 조회
    const merchant = await this.prisma.merchants.findFirst({
      where: { id: apiKey.merchant_id },
      select: { merchant_name: true },
    });

    return {
      paymentKey: order.payment_key,
      orderId: order.order_id,
      orderName: order.order_name,
      amount: Number(order.amount),
      status: order.status,
      merchantName: merchant?.merchant_name ?? '가맹점',
    };
  }
}
