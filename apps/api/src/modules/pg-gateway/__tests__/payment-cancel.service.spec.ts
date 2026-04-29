// ============================================================
// Phase 6 테스트 — 결제 취소/환불 서비스 전체 검증
// POST /pg/v1/payments/:paymentKey/cancel
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentCancelService } from '../services/payment-cancel.service';
import { ACQUIRER_PROVIDER } from '@pg-system/shared';
import { WebhookService } from '../services/webhook.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import {
  ERROR_CODES,
  PAYMENT_METHODS,
  PG_PAYMENT_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
} from '@pg-system/shared';

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  transactions: {
    findUnique: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---- MockAcquirer Mock ----
const mockAcquirer = {
  cancelCardPayment: jest.fn(),
};

// ---- FeeCalculator Mock ----
// FeeCalculator는 cancel 서비스에서 직접 사용하지 않음 (confirm에서만 사용)

// ---- WebhookService Mock ----
const mockWebhookService = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- 픽스처 팩토리 ----
const MERCHANT_ID = 'merchant-uuid-1';
const OTHER_MERCHANT_ID = 'merchant-uuid-other';
const PAYMENT_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TRAN_NO = 'TXN17093847561234';

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-id-1',
  payment_key: PAYMENT_KEY,
  merchant_id: MERCHANT_ID,
  order_id: 'ORDER-2024-001',
  order_name: '테스트 상품',
  amount: 10000n,
  status: PG_PAYMENT_STATUS.DONE,
  payment_method: PAYMENT_METHODS.CARD,
  expires_at: new Date(Date.now() + 10 * 60 * 1000),
  approved_at: new Date(),
  cancel_reason: null,
  cancel_amount: null,
  transaction_id: 'tran-id-1',
  api_key_id: 'key-id-1',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeOriginalTran = (overrides: Record<string, unknown> = {}) => ({
  id: 'tran-id-1',
  tran_no: TRAN_NO,
  merchant_id: MERCHANT_ID,
  tran_type: TRANSACTION_TYPES.PAYMENT,
  payment_method: PAYMENT_METHODS.CARD,
  status: TRANSACTION_STATUS.APPROVED,
  amount: 10000n,
  fee_amount: 350n,
  net_amount: 9650n,
  vat_amount: 0n,
  cancel_amount: null,
  cancel_reason: null,
  original_tran_id: null,
  payment_detail: { approvalNumber: 'APR17093847561234' },
  approved_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeDto = (overrides: Record<string, unknown> = {}) => ({
  cancelReason: '고객 요청 취소',
  ...overrides,
});

const makeCancelSuccess = () => ({
  success: true,
  cancelNumber: 'CAN17093847561234',
  cancelledAt: new Date().toISOString(),
});

// 누적 취소 없음 (기본값)
const makeAggregateZero = () => ({ _sum: { amount: null } });

// ============================================================
// PaymentCancelService 테스트
// ============================================================
describe('PaymentCancelService', () => {
  let service: PaymentCancelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCancelService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ACQUIRER_PROVIDER, useValue: mockAcquirer },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<PaymentCancelService>(PaymentCancelService);
    jest.clearAllMocks();

    // 기본 $transaction: 콜백 통과 + update 반환
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.transactions.create.mockResolvedValue({});
        mockPrisma.pg_payment_orders.update.mockResolvedValue(
          makeOrder({ status: PG_PAYMENT_STATUS.CANCELED }),
        );
        return cb(mockPrisma);
      },
    );
  });

  // ── TC-01: 전액 취소 성공 ──
  it('TC-01: cancelAmount 미입력 → 전액 취소, status=CANCELED, tran_type=CANCEL', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue(makeAggregateZero());
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    const result = await service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID);

    expect(result.status).toBe(PG_PAYMENT_STATUS.CANCELED);

    // CANCEL 타입으로 create 호출 확인
    const createCall = mockPrisma.transactions.create.mock.calls[0][0];
    expect(createCall.data.tran_type).toBe(TRANSACTION_TYPES.CANCEL);
    expect(createCall.data.amount).toBe(10000n);
  });

  // ── TC-02: 부분 취소 성공 ──
  it('TC-02: cancelAmount=3000 → 부분 취소, status=PARTIAL_CANCELED, tran_type=PARTIAL_CANCEL', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue(makeAggregateZero());
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.transactions.create.mockResolvedValue({});
        mockPrisma.pg_payment_orders.update.mockResolvedValue(
          makeOrder({ status: PG_PAYMENT_STATUS.PARTIAL_CANCELED }),
        );
        return cb(mockPrisma);
      },
    );

    const result = await service.cancel(
      PAYMENT_KEY,
      makeDto({ cancelAmount: 3000 }),
      MERCHANT_ID,
    );

    expect(result.status).toBe(PG_PAYMENT_STATUS.PARTIAL_CANCELED);

    const createCall = mockPrisma.transactions.create.mock.calls[0][0];
    expect(createCall.data.tran_type).toBe(TRANSACTION_TYPES.PARTIAL_CANCEL);
    expect(createCall.data.amount).toBe(3000n);
  });

  // ── TC-03: 부분 취소 2회 누적 정상 ──
  it('TC-03: 이미 3000 취소 후 4000 부분 취소 → 누적 7000, PARTIAL_CANCELED', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.PARTIAL_CANCELED }),
    );
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    // 이미 3000 취소된 상태
    mockPrisma.transactions.aggregate.mockResolvedValue({
      _sum: { amount: 3000n },
    });
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.transactions.create.mockResolvedValue({});
        mockPrisma.pg_payment_orders.update.mockResolvedValue(
          makeOrder({ status: PG_PAYMENT_STATUS.PARTIAL_CANCELED }),
        );
        return cb(mockPrisma);
      },
    );

    const result = await service.cancel(
      PAYMENT_KEY,
      makeDto({ cancelAmount: 4000 }),
      MERCHANT_ID,
    );

    expect(result.status).toBe(PG_PAYMENT_STATUS.PARTIAL_CANCELED);
    const createCall = mockPrisma.transactions.create.mock.calls[0][0];
    expect(createCall.data.tran_type).toBe(TRANSACTION_TYPES.PARTIAL_CANCEL);
  });

  // ── TC-04: 부분 취소 후 나머지 전액 취소 ──
  it('TC-04: 이미 3000 취소 후 나머지 7000 취소 → isFullCancel=true, CANCELED', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.PARTIAL_CANCELED }),
    );
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    // 이미 3000 취소된 상태
    mockPrisma.transactions.aggregate.mockResolvedValue({
      _sum: { amount: 3000n },
    });
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    const result = await service.cancel(
      PAYMENT_KEY,
      makeDto({ cancelAmount: 7000 }),
      MERCHANT_ID,
    );

    expect(result.status).toBe(PG_PAYMENT_STATUS.CANCELED);
    const createCall = mockPrisma.transactions.create.mock.calls[0][0];
    expect(createCall.data.tran_type).toBe(TRANSACTION_TYPES.CANCEL);
  });

  // ── TC-05: 이미 전액 취소된 거래 재취소 ──
  it('TC-05: CANCELED 상태 재취소 → TXN_003 에러', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.CANCELED }),
    );

    await expect(
      service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID);
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.TXN_003);
    }
  });

  // ── TC-06: 취소 금액이 남은 금액 초과 ──
  it('TC-06: 이미 8000 취소 후 5000 취소 시도 → PGW_007 에러', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.PARTIAL_CANCELED }),
    );
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue({
      _sum: { amount: 8000n },
    });

    await expect(
      service.cancel(PAYMENT_KEY, makeDto({ cancelAmount: 5000 }), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.cancel(
        PAYMENT_KEY,
        makeDto({ cancelAmount: 5000 }),
        MERCHANT_ID,
      );
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.PGW_007);
    }
  });

  // ── TC-07: 다른 가맹점의 주문 취소 시도 (merchantId 격리) ──
  it('TC-07: 다른 merchantId → NotFoundException (TXN_001)', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

    await expect(
      service.cancel(PAYMENT_KEY, makeDto(), OTHER_MERCHANT_ID),
    ).rejects.toThrow(NotFoundException);

    try {
      await service.cancel(PAYMENT_KEY, makeDto(), OTHER_MERCHANT_ID);
    } catch (err) {
      const error = err as NotFoundException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.TXN_001);
    }
  });

  // ── TC-08: READY 상태(미승인) 주문 취소 ──
  it('TC-08: READY 상태 주문 취소 → BadRequestException (TXN_003)', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.READY }),
    );

    await expect(
      service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ── TC-09: cancelAmount 미입력 → 전액 취소로 처리 ──
  it('TC-09: cancelAmount 미입력 → amount=10000 전액 취소로 처리', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue(makeAggregateZero());
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    await service.cancel(PAYMENT_KEY, { cancelReason: '전액 취소' }, MERCHANT_ID);

    // cancelCardPayment에 전체 금액 전달 확인
    expect(mockAcquirer.cancelCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAmount: 10000 }),
    );
  });

  // ── TC-10: 웹훅 발송 확인 ──
  it('TC-10: 취소 성공 → webhookService.dispatch 호출됨', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue(makeAggregateZero());
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    await service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID);

    expect(mockWebhookService.dispatch).toHaveBeenCalledWith(
      'order-id-1',
      MERCHANT_ID,
      expect.any(String),
    );
  });

  // ── TC-11: Mock 카드사 취소 호출 확인 ──
  it('TC-11: CARD 결제 취소 → cancelCardPayment 호출됨', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.transactions.findUnique.mockResolvedValue(makeOriginalTran());
    mockPrisma.transactions.aggregate.mockResolvedValue(makeAggregateZero());
    mockAcquirer.cancelCardPayment.mockResolvedValue(makeCancelSuccess());

    await service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID);

    expect(mockAcquirer.cancelCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalNumber: 'APR17093847561234',
        cancelAmount: 10000,
      }),
    );
  });

  // ── TC-12: 주문에 transaction_id 없음 → 에러 ──
  it('TC-12: transaction_id 없는 주문 → BadRequestException (TXN_001)', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ transaction_id: null }),
    );

    await expect(
      service.cancel(PAYMENT_KEY, makeDto(), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);
  });
});
