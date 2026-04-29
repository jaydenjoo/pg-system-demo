// ============================================================
// PG Gateway — 결제 승인 확정 서비스 (8단계)
// POST /pg/v1/payments/confirm
// ============================================================

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
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
import type { PaymentOrderResponse, PgCardPaymentDetail, AcquirerProvider } from '@pg-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentOrderResponseDto } from '../dto/payment-order-response.dto';
import type { ConfirmPaymentDto } from '../dto/confirm-payment.dto';
import { PgFeeCalculatorService } from './pg-fee-calculator.service';
import { WebhookService } from './webhook.service';
import { FdsRuleEngineService } from './fds-rule-engine.service';
import { SecurityService } from '../../security/security.service';
import { CardTokenizationService } from './card-tokenization.service';

/** 카드번호 미제공 시 사용하는 테스트용 기본 카드번호 */
const DEFAULT_TEST_CARD_NUMBER = '4111111111111111';

/**
 * @description PG 결제 승인 확정 서비스.
 * 가맹점이 결제창에서 수집한 결제 정보를 바탕으로 카드사 승인을 요청하고,
 * 승인 성공 시 거래 기록(transactions)과 주문 상태(DONE)를 원자적으로 업데이트.
 * 9단계 파이프라인: 주문조회 → orderId검증 → 상태검증 → 만료검증 → 금액검증
 * → FDS검사 → 카드사승인 → DB트랜잭션 → 웹훅발송.
 * @security PCI DSS 6.5.5 — 부적절한 오류 처리 방지 (단계별 구체적 에러 코드)
 * @security PCI DSS 10.2.2 — 금융 거래 처리 이력 기록 (감사 로그)
 * @audit 승인 성공 시 PG_PAYMENT_CONFIRM 감사 로그 기록 (fire-and-forget)
 */
@Injectable()
export class PaymentConfirmService {
  private readonly logger = new Logger(PaymentConfirmService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACQUIRER_PROVIDER) private readonly acquirer: AcquirerProvider,
    private readonly feeCalculator: PgFeeCalculatorService,
    private readonly webhookService: WebhookService,
    private readonly fdsRuleEngine: FdsRuleEngineService,
    private readonly security: SecurityService,
    private readonly cardTokenization: CardTokenizationService,
  ) {}

  /**
   * @description 결제 승인 확정. 9단계 검증 파이프라인을 거쳐 카드사 승인 후 DB에 기록.
   * 1. paymentKey+merchantId 주문 조회 (가맹점 격리)
   * 2. orderId 교차 검증
   * 3. 완료/취소 상태 검증 → PGW_003
   * 4. 만료 시간 검증 → EXPIRED 처리 (PGW_004)
   * 5. 금액 변조 검증 → PGW_002
   * 5.5. FDS 이상거래 검사 → ABORTED 처리 (FDS_001)
   * 6. Mock 카드사 승인 요청
   * 7. 카드사 거절 → ABORTED 처리 (PGW_005)
   * 8. DB 트랜잭션 (pg_payment_orders DONE + transactions 생성)
   * 9. 웹훅 발송 (best-effort)
   * @param {ConfirmPaymentDto} dto - 결제 확정 요청 (paymentKey, orderId, amount 등)
   * @param {string} merchantId - 가맹점 ID (Basic Auth에서 추출, 데이터 격리용)
   * @returns {Promise<PaymentOrderResponse>} 승인된 결제 주문 응답 (카드 상세 포함)
   * @security PCI DSS 10.2.2 — 결제 승인 처리 이력 기록
   * @security PCI DSS 6.5.10 — 금액 변조 방지 (프론트/백엔드 교차 검증)
   * @audit 감사 로그: paymentKey, merchantId, amount, acquirerApprovalNo 기록
   */
  async confirm(
    dto: ConfirmPaymentDto,
    merchantId: string,
  ): Promise<PaymentOrderResponse> {
    // ── Step 1: 주문 조회 (@@unique([payment_key, merchant_id]) 복합 유니크 — DB 레벨 원자적 격리) ──
    const order = await this.prisma.pg_payment_orders.findUnique({
      where: { uq_payment_key_merchant: { payment_key: dto.paymentKey, merchant_id: merchantId } },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    // ── Step 2: orderId 교차 검증 ──
    if (order.order_id !== dto.orderId) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_001,
        message: '주문 ID가 일치하지 않습니다',
      });
    }

    // ── Step 3: 최종 상태 검증 ──
    if (order.status === PG_PAYMENT_STATUS.DONE) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_003,
        message: '이미 승인된 결제입니다',
      });
    }

    if (
      order.status === PG_PAYMENT_STATUS.ABORTED ||
      order.status === PG_PAYMENT_STATUS.CANCELED ||
      order.status === PG_PAYMENT_STATUS.EXPIRED
    ) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.PGW_003,
        message: '처리할 수 없는 결제 상태입니다',
      });
    }

    // ── Step 4: 만료 시간 검증 ──
    if (order.expires_at < new Date()) {
      await this.prisma.pg_payment_orders.update({
        where: { id: order.id },
        data: { status: PG_PAYMENT_STATUS.EXPIRED },
      });
      throw new UnprocessableEntityException({
        code: ERROR_CODES.PGW_004,
        message: '결제 시간이 초과되었습니다',
      });
    }

    // ── Step 5: 금액 검증 ──
    if (BigInt(dto.amount) !== order.amount) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_002,
        message: '결제 금액이 일치하지 않습니다',
      });
    }

    // ── Step 5.5: FDS 이상거래 검사 ──
    const cardNumber = dto.cardNumber ?? DEFAULT_TEST_CARD_NUMBER;
    const fdsResult = await this.fdsRuleEngine.evaluate({
      merchantId,
      amount: dto.amount,
      cardNumber,
      paymentKey: dto.paymentKey,
    });

    if (fdsResult.blocked) {
      await this.prisma.pg_payment_orders.update({
        where: { id: order.id },
        data: { status: PG_PAYMENT_STATUS.ABORTED },
      });
      this.logger.warn(
        `[Confirm] FDS 차단 — paymentKey=${dto.paymentKey} rules=${fdsResult.violations.map((v) => v.ruleId).join(',')}`,
      );
      throw new UnprocessableEntityException({
        code: ERROR_CODES.FDS_001,
        message: '이상거래가 탐지되어 결제가 차단되었습니다',
      });
    }

    if (fdsResult.warnings.length > 0) {
      this.logger.warn(
        `[Confirm] FDS 경고 — paymentKey=${dto.paymentKey} warnings=${fdsResult.warnings.join('; ')}`,
      );
    }

    // ── Step 5.75: 카드 토큰화 (PCI DSS 3.4 — PAN 평문 대신 토큰 저장) ──
    // FDS가 카드번호 패턴 분석을 마친 후 토큰화 진행
    const tokenResult = await this.cardTokenization.tokenize({
      cardNumber,
      merchantId,
      cardCompany: dto.cardCompany ?? 'UNKNOWN',
      ...(dto.cardType != null && { cardType: dto.cardType }),
      ...(dto.cardBrand != null && { cardBrand: dto.cardBrand }),
    });

    this.logger.debug(
      `[Confirm] 카드 토큰화 ${tokenResult.isNewToken ? '생성' : '재사용'} — bin=${tokenResult.cardBin}****${tokenResult.lastFour}`,
    );

    // ── Step 6: Mock 카드사 승인 요청 ──
    // VAN 전달 시에는 원본 PAN 필요 → cardNumber 그대로 사용
    // 실 VAN 연동 시에는 detokenize()로 복원하여 전달
    const installmentMonths = dto.installmentMonths ?? 0;

    const acqResult = await this.acquirer.processCardPayment({
      cardNumber,
      amount: dto.amount,
      installmentMonths,
      merchantId,
    });

    // ── Step 7: 카드사 거절 처리 ──
    if (!acqResult.success) {
      await this.prisma.pg_payment_orders.update({
        where: { id: order.id },
        data: { status: PG_PAYMENT_STATUS.ABORTED },
      });

      this.logger.warn(
        `[Confirm] 카드사 거절 — paymentKey=${dto.paymentKey} errorCode=${acqResult.errorCode}`,
      );

      throw new UnprocessableEntityException({
        code: ERROR_CODES.PGW_005,
        message: acqResult.errorMessage ?? '카드사가 결제를 거절했습니다',
      });
    }

    // ── Step 8: DB 트랜잭션 ──
    const paymentMethod = order.payment_method ?? PAYMENT_METHODS.CARD;
    const cardCompany = acqResult.cardCompany;

    const fee = await this.feeCalculator.calculate(
      merchantId,
      paymentMethod,
      order.amount,
      cardCompany,
    );

    const approvedAt = new Date();

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // transactions 레코드 생성
      const tran = await tx.transactions.create({
        data: {
          tran_no: this.generateTranNo(),
          merchant_id: merchantId,
          tran_type: TRANSACTION_TYPES.PAYMENT,
          payment_method: paymentMethod,
          status: TRANSACTION_STATUS.APPROVED,
          amount: order.amount,
          fee_amount: fee.feeAmount,
          net_amount: fee.netAmount,
          vat_amount: 0n,
          payment_detail: {
            approvalNumber: acqResult.approvalNumber,
            maskedCardNumber: acqResult.maskedCardNumber,
            cardCompany: acqResult.cardCompany,
            cardType: acqResult.cardType,
            installmentMonths,
            cardToken: tokenResult.token,
          },
          approved_at: approvedAt,
        },
      });

      // pg_payment_orders 확정
      return tx.pg_payment_orders.update({
        where: { id: order.id },
        data: {
          status: PG_PAYMENT_STATUS.DONE,
          transaction_id: tran.id,
          approved_at: approvedAt,
          payment_method: paymentMethod,
        },
      });
    });

    this.logger.log(
      `[Confirm] 승인 완료 — paymentKey=${dto.paymentKey} approvalNo=${acqResult.approvalNumber}`,
    );

    // ── 감사 로그 기록 (PCI DSS 10.2.2 — fire-and-forget) ──
    this.security
      .writeAuditLog({
        action: AUDIT_ACTIONS.PG_PAYMENT_CONFIRM,
        resourceType: 'pg_payment_orders',
        resourceId: order.id,
        detail: {
          paymentKey: dto.paymentKey,
          merchantId,
          amount: Number(order.amount),
          acquirerApprovalNo: acqResult.approvalNumber,
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`[Confirm] 감사 로그 기록 실패 (무시) — ${msg}`);
      });

    // ── Step 9: 웹훅 발송 (best-effort — 실패해도 결제 승인 유지) ──
    this.webhookService
      .dispatch(
        order.id,
        merchantId,
        WEBHOOK_EVENT_TYPES.PAYMENT_STATUS_CHANGED,
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`[Confirm] 웹훅 발송 실패 (무시) — ${msg}`);
      });

    const card: PgCardPaymentDetail = {
      company: (cardCompany ?? 'UNKNOWN') as PgCardPaymentDetail['company'],
      number: acqResult.maskedCardNumber ?? '',
      installmentPlanMonths: installmentMonths,
      approveNo: acqResult.approvalNumber ?? '',
      cardType: acqResult.cardType ?? 'CREDIT',
    };

    return PaymentOrderResponseDto.fromEntity(updatedOrder, card);
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
