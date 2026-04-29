// ============================================================
// Phase 7 테스트 — 가상계좌 서비스 전체 검증
// POST /pg/v1/virtual-account/confirm
// POST /pg/v1/virtual-account/deposit-callback
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VirtualAccountService } from '../services/virtual-account.service';
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
  WEBHOOK_EVENT_TYPES,
} from '@pg-system/shared';

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  transactions: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---- MockAcquirer Mock ----
const mockAcquirer = {
  createVirtualAccount: jest.fn(),
};

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
const ORDER_ID = 'ORDER-2024-001';
const ACCOUNT_NUMBER = '0881234567890';

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-id-1',
  payment_key: PAYMENT_KEY,
  merchant_id: MERCHANT_ID,
  order_id: ORDER_ID,
  order_name: '테스트 상품',
  amount: 10000n,
  status: PG_PAYMENT_STATUS.READY,
  payment_method: null,
  customer_email: null,
  customer_name: null,
  expires_at: new Date(Date.now() + 30 * 60 * 1000),
  approved_at: null,
  cancel_reason: null,
  cancel_amount: null,
  transaction_id: null,
  api_key_id: 'key-id-1',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeVaResult = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  accountNumber: ACCOUNT_NUMBER,
  bankCode: '088',
  dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

const makeConfirmDto = (overrides: Record<string, unknown> = {}) => ({
  paymentKey: PAYMENT_KEY,
  orderId: ORDER_ID,
  amount: 10000,
  ...overrides,
});

const makeCallbackDto = (overrides: Record<string, unknown> = {}) => ({
  accountNumber: ACCOUNT_NUMBER,
  amount: 10000,
  depositorName: '홍길동',
  bankCode: '088',
  ...overrides,
});

// ============================================================
// VirtualAccountService 테스트
// ============================================================
describe('VirtualAccountService', () => {
  let service: VirtualAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VirtualAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ACQUIRER_PROVIDER, useValue: mockAcquirer },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<VirtualAccountService>(VirtualAccountService);
    jest.clearAllMocks();
    VirtualAccountService.vaStore.clear();

    // 기본 $transaction: 콜백 통과
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.transactions.create.mockResolvedValue({ id: 'new-tran-id' });
        mockPrisma.pg_payment_orders.update.mockResolvedValue(
          makeOrder({ status: PG_PAYMENT_STATUS.DONE, approved_at: new Date() }),
        );
        return cb(mockPrisma);
      },
    );
  });

  // ── TC-01: 정상 발급 → WAITING_FOR_DEPOSIT 응답 ──
  it('TC-01: 정상 발급 → status=WAITING_FOR_DEPOSIT, virtualAccount 포함 응답', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_payment_orders.update.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );
    mockAcquirer.createVirtualAccount.mockResolvedValue(makeVaResult());

    const result = await service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID);

    expect(result.status).toBe(PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT);
    expect(result.virtualAccount).toBeDefined();
    expect(result.virtualAccount?.accountNumber).toBe(ACCOUNT_NUMBER);
  });

  // ── TC-02: 다른 merchantId → NotFoundException (TXN_001) ──
  it('TC-02: 다른 merchantId → NotFoundException (TXN_001)', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(null);

    await expect(
      service.issueVirtualAccount(makeConfirmDto(), OTHER_MERCHANT_ID),
    ).rejects.toThrow(NotFoundException);

    try {
      await service.issueVirtualAccount(makeConfirmDto(), OTHER_MERCHANT_ID);
    } catch (err) {
      const error = err as NotFoundException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.TXN_001);
    }
  });

  // ── TC-03: READY 아닌 상태 → BadRequestException (TXN_003) ──
  it('TC-03: DONE 상태 주문 → BadRequestException (TXN_003)', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.DONE }),
    );

    await expect(
      service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID);
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.TXN_003);
    }
  });

  // ── TC-04: 금액 불일치 → BadRequestException (PGW_002) ──
  it('TC-04: 금액 불일치 → BadRequestException (PGW_002)', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());

    await expect(
      service.issueVirtualAccount(makeConfirmDto({ amount: 99999 }), MERCHANT_ID),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.issueVirtualAccount(makeConfirmDto({ amount: 99999 }), MERCHANT_ID);
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.PGW_002);
    }
  });

  // ── TC-05: bankCode 미입력 → 기본값 '088'로 호출됨 ──
  it('TC-05: bankCode 미입력 → createVirtualAccount에 bankCode=\'088\' 전달', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_payment_orders.update.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );
    mockAcquirer.createVirtualAccount.mockResolvedValue(makeVaResult());

    await service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID);

    expect(mockAcquirer.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ bankCode: '088' }),
    );
  });

  // ── TC-06: customerName 미입력 → 기본값 '입금자'로 호출됨 ──
  it('TC-06: customerName 미입력 → createVirtualAccount에 customerName=\'입금자\' 전달', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_payment_orders.update.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );
    mockAcquirer.createVirtualAccount.mockResolvedValue(makeVaResult());

    await service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID);

    expect(mockAcquirer.createVirtualAccount).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: '입금자' }),
    );
  });

  // ── TC-07: 발급 성공 → vaStore에 세션 저장됨 ──
  it('TC-07: 발급 성공 → vaStore.get(accountNumber)에 세션 저장됨', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_payment_orders.update.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );
    mockAcquirer.createVirtualAccount.mockResolvedValue(makeVaResult());

    await service.issueVirtualAccount(makeConfirmDto(), MERCHANT_ID);

    const session = VirtualAccountService.vaStore.get(ACCOUNT_NUMBER);
    expect(session).toBeDefined();
    expect(session?.paymentKey).toBe(PAYMENT_KEY);
    expect(session?.amount).toBe(10000);
    expect(session?.merchantId).toBe(MERCHANT_ID);
  });

  // ── TC-08: orderId 불일치 → BadRequestException (PGW_002) ──
  it('TC-08: orderId 불일치 → BadRequestException (PGW_002)', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());

    await expect(
      service.issueVirtualAccount(
        makeConfirmDto({ orderId: 'WRONG-ORDER-ID' }),
        MERCHANT_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.issueVirtualAccount(
        makeConfirmDto({ orderId: 'WRONG-ORDER-ID' }),
        MERCHANT_ID,
      );
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.PGW_002);
    }
  });

  // ── TC-09: 입금 콜백 성공 → { ok: true }, transaction 생성됨 ──
  it('TC-09: 입금 콜백 성공 → { ok: true }, transactions.create 호출됨', async () => {
    // 세션 수동 저장
    VirtualAccountService.vaStore.set(
      ACCOUNT_NUMBER,
      {
        orderId: ORDER_ID,
        merchantId: MERCHANT_ID,
        paymentKey: PAYMENT_KEY,
        accountNumber: ACCOUNT_NUMBER,
        bankCode: '088',
        amount: 10000,
        customerName: '홍길동',
        dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      72 * 60 * 60 * 1000,
    );
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );

    const result = await service.handleDepositCallback(makeCallbackDto());

    expect(result.ok).toBe(true);

    const createCall = mockPrisma.transactions.create.mock.calls[0][0];
    expect(createCall.data.tran_type).toBe(TRANSACTION_TYPES.PAYMENT);
    expect(createCall.data.payment_method).toBe(PAYMENT_METHODS.VIRTUAL_ACCOUNT);
    expect(createCall.data.status).toBe(TRANSACTION_STATUS.APPROVED);
    expect(createCall.data.amount).toBe(10000n);
  });

  // ── TC-10: 존재하지 않는 accountNumber → NotFoundException (PGW_008) ──
  it('TC-10: 미존재/만료 accountNumber → NotFoundException (PGW_008)', async () => {
    // vaStore 비어있음 (beforeEach에서 clear 됨)

    await expect(
      service.handleDepositCallback(makeCallbackDto()),
    ).rejects.toThrow(NotFoundException);

    try {
      await service.handleDepositCallback(makeCallbackDto());
    } catch (err) {
      const error = err as NotFoundException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.PGW_008);
    }
  });

  // ── TC-11: 입금 금액 불일치 → BadRequestException (PGW_002) ──
  it('TC-11: 입금 금액 불일치 → BadRequestException (PGW_002)', async () => {
    VirtualAccountService.vaStore.set(
      ACCOUNT_NUMBER,
      {
        orderId: ORDER_ID,
        merchantId: MERCHANT_ID,
        paymentKey: PAYMENT_KEY,
        accountNumber: ACCOUNT_NUMBER,
        bankCode: '088',
        amount: 10000,
        customerName: '홍길동',
        dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      72 * 60 * 60 * 1000,
    );

    await expect(
      service.handleDepositCallback(makeCallbackDto({ amount: 5000 })),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.handleDepositCallback(makeCallbackDto({ amount: 5000 }));
    } catch (err) {
      const error = err as BadRequestException;
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe(ERROR_CODES.PGW_002);
    }
  });

  // ── TC-12: 입금 성공 → webhookService.dispatch(DEPOSIT_CALLBACK) 호출됨 ──
  it('TC-12: 입금 성공 → webhookService.dispatch(DEPOSIT_CALLBACK) 호출됨', async () => {
    VirtualAccountService.vaStore.set(
      ACCOUNT_NUMBER,
      {
        orderId: ORDER_ID,
        merchantId: MERCHANT_ID,
        paymentKey: PAYMENT_KEY,
        accountNumber: ACCOUNT_NUMBER,
        bankCode: '088',
        amount: 10000,
        customerName: '홍길동',
        dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      72 * 60 * 60 * 1000,
    );
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(
      makeOrder({ status: PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT }),
    );

    await service.handleDepositCallback(makeCallbackDto());

    expect(mockWebhookService.dispatch).toHaveBeenCalledWith(
      'order-id-1',
      MERCHANT_ID,
      WEBHOOK_EVENT_TYPES.DEPOSIT_CALLBACK,
    );
  });
});
