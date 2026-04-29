// ============================================================
// Phase 4 테스트 — 결제 승인 확정 서비스 전체 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PaymentConfirmService } from '../services/payment-confirm.service';
import { PgFeeCalculatorService } from '../services/pg-fee-calculator.service';
import { ACQUIRER_PROVIDER } from '@pg-system/shared';
import { WebhookService } from '../services/webhook.service';
import { FdsRuleEngineService } from '../services/fds-rule-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { CardTokenizationService } from '../services/card-tokenization.service';
import {
  ERROR_CODES,
  PG_PAYMENT_STATUS,
  PAYMENT_METHODS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
} from '@pg-system/shared';

// ---- Prisma Mock ----
const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

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

// ---- MockAcquirer Mock ----
const mockAcquirer = {
  processCardPayment: jest.fn(),
};

// ---- WebhookService Mock ----
const mockWebhookService = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

// ---- FdsRuleEngineService Mock ----
const mockFdsRuleEngine = {
  evaluate: jest.fn().mockResolvedValue({ blocked: false, warnings: [], violations: [] }),
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

// ---- 픽스처 팩토리 ----
const MERCHANT_ID = 'merchant-uuid-1';
const PAYMENT_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ORDER_ID = 'ORDER-2024-001';

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-id-1',
  payment_key: PAYMENT_KEY,
  merchant_id: MERCHANT_ID,
  order_id: ORDER_ID,
  order_name: '테스트 상품',
  amount: 10000n,
  status: PG_PAYMENT_STATUS.READY,
  payment_method: PAYMENT_METHODS.CARD,
  expires_at: new Date(Date.now() + 10 * 60 * 1000), // +10분
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

const makeAcqSuccess = () => ({
  success: true,
  approvalNumber: 'APR17093847561234',
  maskedCardNumber: '411111****',
  cardCompany: 'SHINHAN',
  cardType: 'CREDIT',
  approvedAt: new Date().toISOString(),
});

const makeAcqFailure = (errorCode: string) => ({
  success: false,
  errorCode,
  errorMessage: '카드사 거절',
});

const makeTran = () => ({
  id: 'tran-id-1',
  tran_no: 'TXN17093847561234',
  merchant_id: MERCHANT_ID,
  tran_type: TRANSACTION_TYPES.PAYMENT,
  payment_method: PAYMENT_METHODS.CARD,
  status: TRANSACTION_STATUS.APPROVED,
  amount: 10000n,
  fee_amount: 350n,
  net_amount: 9650n,
  vat_amount: 0n,
  payment_detail: {},
  approved_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
});

const makeUpdatedOrder = (overrides: Record<string, unknown> = {}) =>
  makeOrder({
    status: PG_PAYMENT_STATUS.DONE,
    transaction_id: 'tran-id-1',
    approved_at: new Date(),
    ...overrides,
  });

// ============================================================
// PaymentConfirmService 테스트
// ============================================================
describe('PaymentConfirmService', () => {
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

  // ── TC-1: 정상 승인 ──
  it('정상 요청 → DONE 상태 + approvalNumber 반환', async () => {
    const order = makeOrder();
    const acqResult = makeAcqSuccess();
    const tran = makeTran();
    const updatedOrder = makeUpdatedOrder();

    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(order);
    mockAcquirer.processCardPayment.mockResolvedValue(acqResult);

    // 수수료 조회: 설정 없음 → 기본값 3.5%
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
    expect(result.card?.approveNo).toBe(acqResult.approvalNumber);
    expect(result.card?.company).toBe('SHINHAN');
  });

  // ── TC-2: 존재하지 않는 paymentKey ──
  it('존재하지 않는 paymentKey → TXN_001 NotFoundException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      NotFoundException,
    );

    try {
      await service.confirm(makeDto(), MERCHANT_ID);
    } catch (e) {
      expect((e as NotFoundException).getResponse()).toMatchObject({
        code: ERROR_CODES.TXN_001,
      });
    }
  });

  // ── TC-3: orderId 불일치 ──
  it('orderId 불일치 → VALIDATION_001 BadRequestException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());

    await expect(
      service.confirm(makeDto({ orderId: 'WRONG-ORDER-ID' }), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ── TC-4: 이미 DONE 상태 ──
  it('이미 DONE 상태 → PGW_003 BadRequestException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.DONE }),
    );

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── TC-5: ABORTED 상태 ──
  it('ABORTED 상태 → PGW_003 UnprocessableEntityException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.ABORTED }),
    );

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  // ── TC-6: EXPIRED 상태 ──
  it('EXPIRED 상태 → PGW_003 UnprocessableEntityException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.EXPIRED }),
    );

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  // ── TC-7: 만료 시간 초과 → EXPIRED 업데이트 후 PGW_004 ──
  it('expires_at 초과 → EXPIRED 업데이트 + PGW_004 UnprocessableEntityException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
      makeOrder({ expires_at: new Date(Date.now() - 1000) }), // 1초 전 만료
    );
    mockPrisma.pg_payment_orders.update.mockResolvedValue({});

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(mockPrisma.pg_payment_orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PG_PAYMENT_STATUS.EXPIRED }),
      }),
    );
  });

  // ── TC-8: 금액 불일치 ──
  it('금액 불일치 → PGW_002 BadRequestException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder()); // DB: 10000n

    await expect(
      service.confirm(makeDto({ amount: 9999 }), MERCHANT_ID), // 요청: 9999
    ).rejects.toThrow(BadRequestException);
  });

  // ── TC-9: 카드사 거절 → ABORTED 업데이트 + PGW_005 ──
  it('카드사 거절 → ABORTED 업데이트 + PGW_005 UnprocessableEntityException', async () => {
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makeOrder());
    mockAcquirer.processCardPayment.mockResolvedValue(
      makeAcqFailure(ERROR_CODES.ACQ_001),
    );
    mockPrisma.pg_payment_orders.update.mockResolvedValue({});

    await expect(service.confirm(makeDto(), MERCHANT_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(mockPrisma.pg_payment_orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PG_PAYMENT_STATUS.ABORTED }),
      }),
    );
  });

  // ── TC-10: merchantId 격리 ──
  it('타 가맹점 merchantId → 복합 유니크 불일치 → TXN_001', async () => {
    // 복합 유니크(payment_key + merchant_id)로 조회 → null 반환
    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

    await expect(
      service.confirm(makeDto(), 'other-merchant-id'),
    ).rejects.toThrow(NotFoundException);

    // DB 레벨에서 payment_key + merchant_id 동시 검증
    expect(mockPrisma.pg_payment_orders.findUnique).toHaveBeenCalledWith({
      where: { uq_payment_key_merchant: { payment_key: PAYMENT_KEY, merchant_id: 'other-merchant-id' } },
    });
  });

  // ── TC-11: 수수료 1순위 (merchant_item_fees) 적용 ──
  it('merchant_item_fees 존재 → 해당 수수료율로 fee 계산', async () => {
    const order = makeOrder({ amount: 100000n });
    const acqResult = makeAcqSuccess();
    const tran = makeTran();
    const updatedOrder = makeUpdatedOrder();

    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(order);
    mockAcquirer.processCardPayment.mockResolvedValue(acqResult);

    // 1순위: 2% 수수료율
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue({ fee_rate: 2 });

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.transactions.create.mockResolvedValue(tran);
      mockPrisma.pg_payment_orders.update.mockResolvedValue(updatedOrder);
      return fn(mockPrisma);
    });

    await service.confirm(makeDto({ amount: 100000 }), MERCHANT_ID);

    // fee_amount = 100000 * 2% = 2000, net_amount = 98000
    expect(mockPrisma.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fee_amount: 2000n,
          net_amount: 98000n,
        }),
      }),
    );
  });

  // ── TC-12: 기본 카드번호 사용 ──
  it('cardNumber 미제공 → 기본 테스트 카드번호(4111111111111111)로 카드사 요청', async () => {
    const order = makeOrder();
    const acqResult = makeAcqSuccess();
    const tran = makeTran();
    const updatedOrder = makeUpdatedOrder();

    mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(order);
    mockAcquirer.processCardPayment.mockResolvedValue(acqResult);
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue(null);
    mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.transactions.create.mockResolvedValue(tran);
      mockPrisma.pg_payment_orders.update.mockResolvedValue(updatedOrder);
      return fn(mockPrisma);
    });

    await service.confirm(makeDto(), MERCHANT_ID); // cardNumber 없음

    expect(mockAcquirer.processCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({ cardNumber: '4111111111111111' }),
    );
  });
});

// ============================================================
// PgFeeCalculatorService 테스트
// ============================================================
describe('PgFeeCalculatorService', () => {
  let feeService: PgFeeCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PgFeeCalculatorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    feeService = module.get<PgFeeCalculatorService>(PgFeeCalculatorService);
    jest.clearAllMocks();
  });

  it('모든 수수료 테이블 미설정 → 기본값 3.5% 적용', async () => {
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue(null);
    mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);

    const result = await feeService.calculate(MERCHANT_ID, 'CARD', 10000n);

    expect(result.feeRate).toBe(3.5);
    expect(result.feeAmount).toBe(350n);
    expect(result.netAmount).toBe(9650n);
  });

  it('merchant_commissions 2순위 — item_fees 없을 때 적용', async () => {
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue({ commission_rate: 2.5 });

    const result = await feeService.calculate(MERCHANT_ID, 'CARD', 20000n);

    expect(result.feeRate).toBe(2.5);
    expect(result.feeAmount).toBe(500n);
    expect(result.netAmount).toBe(19500n);
  });

  it('pg_default_margins 3순위 — item_fees, commissions 없을 때 적용', async () => {
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue(null);
    mockPrisma.merchant_commissions.findFirst.mockResolvedValue(null);
    mockPrisma.pg_default_margins.findFirst.mockResolvedValue({ margin_rate: 1.5 });

    const result = await feeService.calculate(MERCHANT_ID, 'CARD', 10000n);

    expect(result.feeRate).toBe(1.5);
    expect(result.feeAmount).toBe(150n);
    expect(result.netAmount).toBe(9850n);
  });

  it('feeAmount + netAmount = amount 항등식 검증', async () => {
    mockPrisma.merchant_item_fees.findFirst.mockResolvedValue({ fee_rate: 3.5 });

    const amount = 100000n;
    const result = await feeService.calculate(MERCHANT_ID, 'CARD', amount);

    expect(result.feeAmount + result.netAmount).toBe(amount);
  });
});
