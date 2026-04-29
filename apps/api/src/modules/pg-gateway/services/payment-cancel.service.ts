// ============================================================
// PG Gateway — 결제 취소/환불 서비스 (7단계)
// POST /pg/v1/payments/:paymentKey/cancel
// 전액 취소 + 부분 취소 (다단계 지원)
// ============================================================

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ACQUIRER_PROVIDER,
  AUDIT_ACTIONS,
  ERROR_CODES,
  PAYMENT_METHODS,
  PG_PAYMENT_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
  WEBHOOK_EVENT_TYPES,
} from '@pg-system/shared';
import type { PaymentOrderResponse, AcquirerProvider } from '@pg-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { SecurityService } from '../../security/security.service';
import { PaymentOrderResponseDto } from '../dto/payment-order-response.dto';
import type { CancelPaymentDto } from '../dto/cancel-payment.dto';

/**
 * @description PG 결제 취소/환불 서비스.
 * 전액 취소와 부분 취소(다단계)를 모두 지원.
 * 누적 취소 금액이 원거래 금액을 초과하지 않도록 검증하고,
 * 전액 취소 시 CANCELED, 부분 취소 시 PARTIAL_CANCELED 상태로 업데이트.
 * @security PCI DSS 10.2.2 — 취소/환불 거래 처리 이력 기록
 * @security PCI DSS 10.2.6 — 결제 상태 변경 기록
 * @audit 취소 시 PG_PAYMENT_CANCEL 또는 PG_PAYMENT_PARTIAL_CANCEL 감사 로그 기록
 */
@Injectable()
export class PaymentCancelService {
  private readonly logger = new Logger(PaymentCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACQUIRER_PROVIDER) private readonly acquirer: AcquirerProvider,
    private readonly webhookService: WebhookService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 결제 취소 처리 (전액/부분). 7단계 검증 파이프라인 수행.
   * 1. paymentKey+merchantId 주문 조회 (가맹점 격리)
   * 2. 취소 가능 상태 검증 (DONE 또는 PARTIAL_CANCELED만 허용)
   * 3. 원거래 transactions 조회
   * 4. 취소 금액 결정 + 누적 취소 금액 초과 검증
   * 5. Mock 카드사 취소 요청 (CARD 결제만)
   * 6. DB 트랜잭션 (취소 transactions 생성 + 주문 상태 업데이트)
   * 7. 웹훅 발송 (best-effort)
   * @param {string} paymentKey - 결제 키 (주문 식별자)
   * @param {CancelPaymentDto} dto - 취소 요청 (cancelAmount, cancelReason)
   * @param {string} merchantId - 가맹점 ID (Basic Auth에서 추출, 데이터 격리용)
   * @returns {Promise<PaymentOrderResponse>} 취소 처리된 결제 주문 응답
   * @security PCI DSS 10.2.2 — 취소/환불 처리 이력 기록
   * @security PCI DSS 10.2.6 — CANCELED/PARTIAL_CANCELED 상태 변경 기록
   * @audit 감사 로그: paymentKey, merchantId, cancelAmount, cancelReason, isFullCancel 기록
   */
  async cancel(
    paymentKey: string,
    dto: CancelPaymentDto,
    merchantId: string,
  ): Promise<PaymentOrderResponse> {
    // ── Step 1: 주문 조회 (@@unique([payment_key, merchant_id]) 복합 유니크 — DB 레벨 원자적 격리) ──
    const order = await this.prisma.pg_payment_orders.findUnique({
      where: { uq_payment_key_merchant: { payment_key: paymentKey, merchant_id: merchantId } },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    // ── Step 2: 취소 가능 상태 검증 ──
    if (order.status === PG_PAYMENT_STATUS.CANCELED) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_003,
        message: '이미 전액 취소된 거래입니다',
      });
    }

    if (
      order.status !== PG_PAYMENT_STATUS.DONE &&
      order.status !== PG_PAYMENT_STATUS.PARTIAL_CANCELED
    ) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_003,
        message: '취소할 수 없는 결제 상태입니다',
      });
    }

    // ── Step 3: 원거래 transaction 조회 ──
    if (!order.transaction_id) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_001,
        message: '원거래 정보를 찾을 수 없습니다',
      });
    }

    const originalTran = await this.prisma.transactions.findUnique({
      where: { id: order.transaction_id },
    });

    if (!originalTran) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_001,
        message: '원거래 정보를 찾을 수 없습니다',
      });
    }

    // ── Step 4: 취소 금액 결정 + 누적 취소 검증 ──
    const orderAmount = Number(order.amount);
    const cancelAmount = dto.cancelAmount ?? orderAmount;

    // 기존 취소 거래 누적 합산 (original_tran_id = UUID)
    const aggregateResult = await this.prisma.transactions.aggregate({
      where: {
        original_tran_id: originalTran.id,
        tran_type: {
          in: [TRANSACTION_TYPES.CANCEL, TRANSACTION_TYPES.PARTIAL_CANCEL],
        },
        status: TRANSACTION_STATUS.APPROVED,
      },
      _sum: { amount: true },
    });

    const alreadyCancelled = Number(aggregateResult._sum?.amount ?? 0n);
    const totalCancelAfterThis = alreadyCancelled + cancelAmount;

    if (totalCancelAfterThis > orderAmount) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_007,
        message: '취소 금액이 원거래 금액을 초과합니다',
      });
    }

    const isFullCancel = totalCancelAfterThis === orderAmount;

    // ── Step 5: Mock 카드사 취소 요청 (CARD인 경우) ──
    if (
      originalTran.payment_method === PAYMENT_METHODS.CARD ||
      order.payment_method === PAYMENT_METHODS.CARD
    ) {
      const detail = originalTran.payment_detail;
      const approvalNumber =
        typeof detail === 'object' && detail !== null && !Array.isArray(detail) &&
        'approvalNumber' in detail && typeof detail.approvalNumber === 'string'
          ? detail.approvalNumber
          : '';

      const cancelResult = await this.acquirer.cancelCardPayment({
        approvalNumber,
        cancelAmount,
        reason: dto.cancelReason,
      });

      if (!cancelResult.success) {
        throw new BadRequestException({
          code: ERROR_CODES.PGW_007,
          message: '카드사 취소 요청이 실패했습니다',
        });
      }
    }
    // CARD 외 결제수단: 바로 성공 처리 (Phase 7 가상계좌에서 확장)

    // ── Step 6: DB 트랜잭션 ──
    const paymentMethod = originalTran.payment_method ?? order.payment_method;
    const newStatus = isFullCancel
      ? PG_PAYMENT_STATUS.CANCELED
      : PG_PAYMENT_STATUS.PARTIAL_CANCELED;

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // 취소 transactions 생성 (original_tran_id = UUID FK)
      await tx.transactions.create({
        data: {
          tran_no: this.generateTranNo(),
          merchant_id: merchantId,
          tran_type: isFullCancel
            ? TRANSACTION_TYPES.CANCEL
            : TRANSACTION_TYPES.PARTIAL_CANCEL,
          payment_method: paymentMethod,
          status: TRANSACTION_STATUS.APPROVED,
          amount: BigInt(cancelAmount),
          original_tran_id: originalTran.id,
          fee_amount: 0n,
          net_amount: BigInt(cancelAmount),
          vat_amount: 0n,
          cancelled_at: new Date(),
        },
      });

      // pg_payment_orders 상태 + 취소 정보 업데이트
      return tx.pg_payment_orders.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          cancel_reason: dto.cancelReason,
          cancel_amount: BigInt(cancelAmount),
        },
      });
    });

    this.logger.log(
      `[Cancel] 취소 완료 — paymentKey=${paymentKey} cancelAmount=${cancelAmount} isFullCancel=${isFullCancel}`,
    );

    // ── 감사 로그 기록 (PCI DSS 10.2.2 — fire-and-forget) ──
    this.security
      .writeAuditLog({
        action: isFullCancel
          ? AUDIT_ACTIONS.PG_PAYMENT_CANCEL
          : AUDIT_ACTIONS.PG_PAYMENT_PARTIAL_CANCEL,
        resourceType: 'pg_payment_orders',
        resourceId: order.id,
        detail: {
          paymentKey,
          merchantId,
          cancelAmount,
          cancelReason: dto.cancelReason,
          isFullCancel,
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`[Cancel] 감사 로그 기록 실패 (무시) — ${msg}`);
      });

    // ── Step 7: 웹훅 발송 (best-effort) ──
    this.webhookService
      .dispatch(order.id, merchantId, WEBHOOK_EVENT_TYPES.PAYMENT_STATUS_CHANGED)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`[Cancel] 웹훅 발송 실패 (무시) — ${msg}`);
      });

    return PaymentOrderResponseDto.fromEntity(updatedOrder, null);
  }

  // ---- Private helpers ----

  private generateTranNo(): string {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `TXN${ts}${rand}`;
  }
}
