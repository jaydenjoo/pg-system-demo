// ============================================================
// PG Gateway — 가상계좌 서비스 (Phase 7)
// POST /pg/v1/virtual-account/confirm  → 가상계좌 발급
// POST /pg/v1/virtual-account/deposit-callback → Mock 은행 입금 콜백
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
import type { PaymentOrderResponse, PgVirtualAccountDetail, AcquirerProvider } from '@pg-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { SecurityService } from '../../security/security.service';
import { PaymentOrderResponseDto } from '../dto/payment-order-response.dto';
import { VolatileMap } from '../mock-acquirer/volatile-map';
import type { VirtualAccountConfirmDto, DepositCallbackDto } from '../dto/virtual-account.dto';

/** 가상계좌 세션 저장 구조 */
interface VaSession {
  orderId: string;
  merchantId: string;
  paymentKey: string;
  accountNumber: string;
  bankCode: string;
  amount: number;
  customerName: string;
  dueDate: string;
}

/** 가상계좌 기본 은행 코드: 신한은행 */
const DEFAULT_BANK_CODE = '088';
/** 기본 입금자명 */
const DEFAULT_CUSTOMER_NAME = '입금자';
/** 가상계좌 세션 TTL: 72시간 */
const VA_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class VirtualAccountService {
  private readonly logger = new Logger(VirtualAccountService.name);

  /**
   * 계좌번호 → 세션 정보 인메모리 저장소 (TTL 72h).
   * static 선언: NestJS 싱글턴 인스턴스 간 상태 공유 보장.
   */
  static readonly vaStore = new VolatileMap<VaSession>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACQUIRER_PROVIDER) private readonly acquirer: AcquirerProvider,
    private readonly webhookService: WebhookService,
    private readonly security: SecurityService,
  ) {}

  /**
   * 가상계좌 발급 확정.
   *
   * 7단계 처리:
   * 1. paymentKey + merchantId 로 주문 조회 (격리)
   * 2. READY 상태 검증
   * 3. 금액 검증 (dto.amount === order.amount)
   * 4. orderId 검증
   * 5. Mock 은행 가상계좌 발급
   * 6. VolatileMap 세션 저장 (TTL 72h)
   * 7. DB 업데이트 (WAITING_FOR_DEPOSIT) + 응답 반환
   */
  async issueVirtualAccount(
    dto: VirtualAccountConfirmDto,
    merchantId: string,
  ): Promise<PaymentOrderResponse> {
    // ── Step 1: 주문 조회 (merchantId 격리) ──
    const order = await this.prisma.pg_payment_orders.findFirst({
      where: { payment_key: dto.paymentKey, merchant_id: merchantId },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    // ── Step 2: READY 상태 검증 ──
    if (order.status !== PG_PAYMENT_STATUS.READY) {
      throw new BadRequestException({
        code: ERROR_CODES.TXN_003,
        message: '가상계좌 발급이 불가능한 결제 상태입니다',
      });
    }

    // ── Step 3: 금액 검증 ──
    if (Number(order.amount) !== dto.amount) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_002,
        message: '결제 금액이 일치하지 않습니다',
      });
    }

    // ── Step 4: orderId 검증 ──
    if (order.order_id !== dto.orderId) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_002,
        message: '주문번호가 일치하지 않습니다',
      });
    }

    // ── Step 5: Mock 은행 가상계좌 발급 ──
    const bankCode = dto.bankCode ?? DEFAULT_BANK_CODE;
    const customerName = dto.customerName ?? DEFAULT_CUSTOMER_NAME;

    const vaResult = await this.acquirer.createVirtualAccount({
      bankCode,
      amount: dto.amount,
      customerName,
    });

    if (!vaResult.success || !vaResult.accountNumber) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_008,
        message: '가상계좌 발급에 실패했습니다',
      });
    }

    // ── Step 6: VolatileMap 세션 저장 (TTL 72h) ──
    const resolvedBankCode = vaResult.bankCode ?? bankCode;
    const dueDate =
      vaResult.dueDate ?? new Date(Date.now() + VA_TTL_MS).toISOString();

    VirtualAccountService.vaStore.set(
      vaResult.accountNumber,
      {
        orderId: order.order_id,
        merchantId,
        paymentKey: dto.paymentKey,
        accountNumber: vaResult.accountNumber,
        bankCode: resolvedBankCode,
        amount: dto.amount,
        customerName,
        dueDate,
      },
      VA_TTL_MS,
    );

    // ── Step 7: DB 업데이트 (WAITING_FOR_DEPOSIT) ──
    const updatedOrder = await this.prisma.pg_payment_orders.update({
      where: { id: order.id },
      data: {
        status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT,
        payment_method: PAYMENT_METHODS.VIRTUAL_ACCOUNT,
        customer_name: customerName,
      },
    });

    this.logger.log(
      `[VA] 가상계좌 발급 — paymentKey=${dto.paymentKey} accountNumber=${vaResult.accountNumber} dueDate=${dueDate}`,
    );

    // ── 감사 로그 기록 (PCI DSS 10.2.2 — fire-and-forget) ──
    this.security
      .writeAuditLog({
        action: AUDIT_ACTIONS.PG_VIRTUAL_ACCOUNT_ISSUED,
        resourceType: 'pg_payment_orders',
        resourceId: order.id,
        detail: {
          paymentKey: dto.paymentKey,
          merchantId,
          amount: dto.amount,
          accountNumber: vaResult.accountNumber,
          bankCode: resolvedBankCode,
          dueDate,
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`[VA] 감사 로그 기록 실패 (무시) — ${msg}`);
      });

    const virtualAccount: PgVirtualAccountDetail = {
      accountNumber: vaResult.accountNumber,
      bankCode: resolvedBankCode,
      customerName,
      dueDate,
    };

    return PaymentOrderResponseDto.fromEntity(updatedOrder, null, virtualAccount);
  }

  /**
   * Mock 은행 입금 콜백 처리.
   *
   * 6단계 처리:
   * 1. VolatileMap에서 accountNumber로 세션 조회
   * 2. 입금 금액 검증
   * 3. DB 주문 조회
   * 4. DB 트랜잭션 (거래 생성 + 주문 상태 DONE)
   * 5. VolatileMap 세션 삭제
   * 6. 웹훅 발송 (best-effort)
   */
  async handleDepositCallback(dto: DepositCallbackDto): Promise<{ ok: boolean }> {
    // ── Step 1: 세션 조회 ──
    const session = VirtualAccountService.vaStore.get(dto.accountNumber);

    if (!session) {
      throw new NotFoundException({
        code: ERROR_CODES.PGW_008,
        message: '입금 대기 중인 가상계좌를 찾을 수 없습니다 (만료 또는 미존재)',
      });
    }

    // ── Step 2: 입금 금액 검증 ──
    if (session.amount !== dto.amount) {
      throw new BadRequestException({
        code: ERROR_CODES.PGW_002,
        message: '입금 금액이 주문 금액과 일치하지 않습니다',
      });
    }

    // ── Step 3: DB 주문 조회 ──
    const order = await this.prisma.pg_payment_orders.findFirst({
      where: { payment_key: session.paymentKey, merchant_id: session.merchantId },
    });

    if (!order) {
      throw new NotFoundException({
        code: ERROR_CODES.TXN_001,
        message: '결제 주문을 찾을 수 없습니다',
      });
    }

    // ── Step 4: DB 트랜잭션 ──
    const depositedAt = dto.depositedAt ? new Date(dto.depositedAt) : new Date();

    await this.prisma.$transaction(async (tx) => {
      const newTran = await tx.transactions.create({
        data: {
          tran_no: this.generateTranNo(),
          merchant_id: session.merchantId,
          tran_type: TRANSACTION_TYPES.PAYMENT,
          payment_method: PAYMENT_METHODS.VIRTUAL_ACCOUNT,
          status: TRANSACTION_STATUS.APPROVED,
          amount: BigInt(session.amount),
          fee_amount: 0n,
          net_amount: BigInt(session.amount),
          vat_amount: 0n,
          payment_detail: {
            accountNumber: dto.accountNumber,
            bankCode: session.bankCode,
            depositorName: dto.depositorName,
          },
          approved_at: depositedAt,
        },
      });

      await tx.pg_payment_orders.update({
        where: { id: order.id },
        data: {
          status: PG_PAYMENT_STATUS.DONE,
          approved_at: depositedAt,
          transaction_id: newTran.id,
        },
      });
    });

    // ── Step 5: 세션 삭제 ──
    VirtualAccountService.vaStore.delete(dto.accountNumber);

    this.logger.log(
      `[VA] 입금 확인 완료 — paymentKey=${session.paymentKey} amount=${session.amount}`,
    );

    // ── 감사 로그 기록 (PCI DSS 10.2.2 — fire-and-forget) ──
    this.security
      .writeAuditLog({
        action: AUDIT_ACTIONS.PG_VIRTUAL_ACCOUNT_DEPOSITED,
        resourceType: 'pg_payment_orders',
        resourceId: order.id,
        detail: {
          paymentKey: session.paymentKey,
          merchantId: session.merchantId,
          amount: session.amount,
          accountNumber: dto.accountNumber,
          depositorName: dto.depositorName,
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`[VA] 입금 감사 로그 기록 실패 (무시) — ${msg}`);
      });

    // ── Step 6: 웹훅 발송 (best-effort) ──
    this.webhookService
      .dispatch(order.id, session.merchantId, WEBHOOK_EVENT_TYPES.DEPOSIT_CALLBACK)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`[VA] 웹훅 발송 실패 (무시) — ${msg}`);
      });

    return { ok: true };
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
