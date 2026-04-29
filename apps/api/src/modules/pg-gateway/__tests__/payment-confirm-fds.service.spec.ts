// ============================================================
// PaymentConfirmService × FDS 통합 테스트 (3 TC)
// Step 5.5 FDS 분기 — BLOCK / WARN / PASS
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PaymentConfirmService } from '../services/payment-confirm.service';
import { PgFeeCalculatorService } from '../services/pg-fee-calculator.service';
import { ACQUIRER_PROVIDER } from '@pg-system/shared';
import { WebhookService } from '../services/webhook.service';
import { FdsRuleEngineService } from '../services/fds-rule-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { CardTokenizationService } from '../services/card-tokenization.service';
import { ERROR_CODES, PG_PAYMENT_STATUS, PAYMENT_METHODS } from '@pg-system/shared';

// ---- Mock Cache ----
const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  transactions: {
    create: jest.fn(),
  },
  merchant_item_fees: { findFirst: jest.fn() },
  merchant_commissions: { findFirst: jest.fn() },
  pg_default_margins: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

// ---- MockAcquirerService Mock ----
const mockAcquirer = {
  processCardPayment: jest.fn(),
};

// ---- WebhookService Mock ----
const mockWebhookService = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

// ---- FdsRuleEngineService Mock ----
const mockFdsRuleEngine = {
  evaluate: jest.fn(),
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- CardTokenizationService Mock ----
const mockCardTokenization = {
  tokenize: jest.fn().mockResolvedValue({
    token: 'a'.repeat(64),
    cardBin: '411111',
    lastFour: '1111',
    cardCompany: 'SHINHAN',
    isNewToken: true,
  }),
};

// ---- 픽스처 ----
const MERCHANT_ID = 'merchant-uuid-1';
const PAYMENT_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ORDER_ID = 'ORDER-FDS-001';

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-id-1',
  payment_key: PAYMENT_KEY,
  merchant_id: MERCHANT_ID,
  order_id: ORDER_ID,
  order_name: 'FDS 테스트 상품',
  amount: 10000n,
  status: PG_PAYMENT_STATUS.READY,
  payment_method: PAYMENT_METHODS.CARD,
  expires_at: new Date(Date.now() + 10 * 60 * 1000),
  approved_at: null,
  cancel_reason: null,
  cancel_amount: null,
  transaction_id: null,
  api_key_id: 'key-id-1',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeDto = (overrides: Record<string, unknown> = {}) => ({
  paymentKey: PAYMENT_KEY,
  orderId: ORDER_ID,
  amount: 10000,
  ...overrides,
});

const makeFdsBlock = () => ({
  blocked: true,
  warnings: [],
  violations: [{ ruleId: 'R1', severity: 'HIGH', action: 'BLOCK', message: '단건 한도 초과' }],
});

const makeFdsWarn = () => ({
  blocked: false,
  warnings: ['심야 고액 결제 감지'],
  violations: [{ ruleId: 'R4', severity: 'MEDIUM', action: 'WARN', message: '심야 고액 결제 감지' }],
});

const makeFdsClear = () => ({
  blocked: false,
  warnings: [],
  violations: [],
});

const makeAcqSuccess = () => ({
  success: true,
  approvalNumber: 'APR17093847561234',
  maskedCardNumber: '411111****',
  cardCompany: 'SHINHAN',
  cardType: 'CREDIT',
  approvedAt: new Date().toISOString(),
});

// ============================================================
describe('PaymentConfirmService — FDS 통합', () => {
  let service: PaymentConfirmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentConfirmService,
        PgFeeCalculatorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ACQUIRER_PROVIDER, useValue: mockAcquirer },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: FdsRuleEngineService, useValue: mockFdsRuleEngine },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: CardTokenizationService, useValue: mockCardTokenization },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<PaymentConfirmService>(PaymentConfirmService);
    jest.clearAllMocks();
  });

  // ── TC-FDS-1: FDS BLOCK → ABORTED 업데이트 + FDS_001 예외 ──
  it('TC-FDS-1: FDS BLOCK → 주문 ABORTED 업데이트 + FDS_001 UnprocessableEntityException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.pg_payment_orders.update.mockResolvedValue({});
    mockFdsRuleEngine.evaluate.mockResolvedValue(makeFdsBlock());

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );

    // FDS_001 에러 코드 검증
    try {
      await service.confirm(makeDto(), MERCHANT_ID);
    } catch (e) {
      expect((e as UnprocessableEntityException).getResponse()).toMatchObject({
        code: ERROR_CODES.FDS_001,
      });
    }

    // 주문 상태가 ABORTED로 업데이트됐는지 검증
    expect(mockPrisma.pg_payment_orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PG_PAYMENT_STATUS.ABORTED }),
      }),
    );

    // FDS BLOCK 이후 카드사 승인 요청이 호출되지 않아야 함
    expect(mockAcquirer.processCardPayment).not.toHaveBeenCalled();
  });

  // ── TC-FDS-2: FDS WARN → 카드사 승인까지 계속 진행 ──
  it('TC-FDS-2: FDS WARN → 차단 없이 카드사 승인 요청까지 진행', async () => {
    const order = makeOrder();
    const tran = {
      id: 'tran-id-1',
      tran_no: 'TXN170938',
      amount: 10000n,
      fee_amount: 350n,
      net_amount: 9650n,
    };
    const updatedOrder = makeOrder({
      status: PG_PAYMENT_STATUS.DONE,
      transaction_id: 'tran-id-1',
      approved_at: new Date(),
    });

    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(order);
    mockFdsRuleEngine.evaluate.mockResolvedValue(makeFdsWarn());
    mockAcquirer.processCardPayment.mockResolvedValue(makeAcqSuccess());
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue(null);
    mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.transactions.create.mockResolvedValue(tran);
      mockPrisma.pg_payment_orders.update.mockResolvedValue(updatedOrder);
      return fn(mockPrisma);
    });

    const result = await service.confirm(makeDto(), MERCHANT_ID);

    // WARN이지만 결제는 완료되어야 함
    expect(result.status).toBe(PG_PAYMENT_STATUS.DONE);
    // 카드사 승인 요청이 호출됐는지 검증
    expect(mockAcquirer.processCardPayment).toHaveBeenCalledTimes(1);
  });

  // ── TC-FDS-3: FDS PASS → 정상 결제 완료 ──
  it('TC-FDS-3: FDS 이상 없음 → 정상 결제 완료 (evaluate 1회 호출)', async () => {
    const order = makeOrder();
    const tran = {
      id: 'tran-id-1',
      tran_no: 'TXN170938',
      amount: 10000n,
      fee_amount: 350n,
      net_amount: 9650n,
    };
    const updatedOrder = makeOrder({
      status: PG_PAYMENT_STATUS.DONE,
      transaction_id: 'tran-id-1',
      approved_at: new Date(),
    });

    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(order);
    mockFdsRuleEngine.evaluate.mockResolvedValue(makeFdsClear());
    mockAcquirer.processCardPayment.mockResolvedValue(makeAcqSuccess());
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue(null);
    mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.transactions.create.mockResolvedValue(tran);
      mockPrisma.pg_payment_orders.update.mockResolvedValue(updatedOrder);
      return fn(mockPrisma);
    });

    const result = await service.confirm(makeDto(), MERCHANT_ID);

    expect(result.status).toBe(PG_PAYMENT_STATUS.DONE);

    // FDS evaluate가 정확히 1번 호출됐는지 확인
    expect(mockFdsRuleEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(mockFdsRuleEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: MERCHANT_ID,
        amount: 10000,
        paymentKey: PAYMENT_KEY,
      }),
    );

    // 주문이 ABORTED로 바뀌지 않아야 함
    const abortedCall = mockPrisma.pg_payment_orders.update.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        'data' in (call[0] as Record<string, unknown>) &&
        (call[0] as { data: { status?: string } }).data?.status === PG_PAYMENT_STATUS.ABORTED,
    );
    expect(abortedCall).toBeUndefined();
  });
});
