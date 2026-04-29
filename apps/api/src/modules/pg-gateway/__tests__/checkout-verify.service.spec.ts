// ============================================================
// CheckoutVerifyService 테스트 — clientKey+paymentKey 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutVerifyService } from '../services/checkout-verify.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES } from '@pg-system/shared';

// ---- Prisma Mock ----

const mockPrisma = {
  pg_api_keys: { findFirst: jest.fn() },
  pg_payment_orders: { findFirst: jest.fn() },
  merchants: { findFirst: jest.fn() },
};

// ---- 테스트 데이터 ----

const MOCK_API_KEY = {
  id: 1n,
  merchant_id: 100n,
  client_key: 'ck_test_abc123',
  is_active: true,
};

const MOCK_ORDER_READY = {
  payment_key: 'pay_test_xyz',
  order_id: 'ORDER-001',
  order_name: '테스트 상품',
  amount: 10000n,
  status: 'READY',
  merchant_id: 100n,
  expires_at: new Date(Date.now() + 3600_000), // 1시간 후
};

const MOCK_MERCHANT = {
  merchant_name: '테스트 가맹점',
};

describe('CheckoutVerifyService', () => {
  let service: CheckoutVerifyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutVerifyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CheckoutVerifyService>(CheckoutVerifyService);
  });

  // ---- 정상 케이스 ----

  it('유효한 clientKey + paymentKey → 결제 정보 반환', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(MOCK_ORDER_READY);
    mockPrisma.merchants.findFirst.mockResolvedValue(MOCK_MERCHANT);

    const result = await service.verify('ck_test_abc123', 'pay_test_xyz');

    expect(result).toEqual({
      paymentKey: 'pay_test_xyz',
      orderId: 'ORDER-001',
      orderName: '테스트 상품',
      amount: 10000,
      status: 'READY',
      merchantName: '테스트 가맹점',
    });
  });

  it('merchant가 없으면 기본 가맹점명 반환', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(MOCK_ORDER_READY);
    mockPrisma.merchants.findFirst.mockResolvedValue(null);

    const result = await service.verify('ck_test_abc123', 'pay_test_xyz');

    expect(result.merchantName).toBe('가맹점');
  });

  // ---- 에러 케이스 ----

  it('유효하지 않은 clientKey → PGW_001 에러', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(null);

    await expect(
      service.verify('invalid_key', 'pay_test_xyz'),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.verify('invalid_key', 'pay_test_xyz');
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as { code: string };
      expect(response.code).toBe(ERROR_CODES.PGW_001);
    }
  });

  it('결제 건이 없으면 → TXN_001 NotFoundException', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(null);

    await expect(
      service.verify('ck_test_abc123', 'pay_test_xyz'),
    ).rejects.toThrow(NotFoundException);
  });

  it('READY가 아닌 상태(DONE) → PGW_003 에러', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue({
      ...MOCK_ORDER_READY,
      status: 'DONE',
    });

    await expect(
      service.verify('ck_test_abc123', 'pay_test_xyz'),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.verify('ck_test_abc123', 'pay_test_xyz');
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as { code: string };
      expect(response.code).toBe(ERROR_CODES.PGW_003);
    }
  });

  it('만료된 결제 → PGW_004 에러', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue({
      ...MOCK_ORDER_READY,
      expires_at: new Date(Date.now() - 60_000), // 1분 전 만료
    });

    await expect(
      service.verify('ck_test_abc123', 'pay_test_xyz'),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.verify('ck_test_abc123', 'pay_test_xyz');
    } catch (err) {
      const ex = err as BadRequestException;
      const response = ex.getResponse() as { code: string };
      expect(response.code).toBe(ERROR_CODES.PGW_004);
    }
  });

  it('expires_at가 null이면 만료 검사 스킵', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue({
      ...MOCK_ORDER_READY,
      expires_at: null,
    });
    mockPrisma.merchants.findFirst.mockResolvedValue(MOCK_MERCHANT);

    const result = await service.verify('ck_test_abc123', 'pay_test_xyz');

    expect(result.paymentKey).toBe('pay_test_xyz');
  });

  // ---- Prisma 쿼리 파라미터 검증 ----

  it('clientKey는 is_active: true 조건으로 조회', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(null);

    await service.verify('ck_test', 'pay_test').catch(() => {});

    expect(mockPrisma.pg_api_keys.findFirst).toHaveBeenCalledWith({
      where: { client_key: 'ck_test', is_active: true },
    });
  });

  it('paymentKey는 merchantId와 함께 조회', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(MOCK_API_KEY);
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(null);

    await service.verify('ck_test_abc123', 'pay_test').catch(() => {});

    expect(mockPrisma.pg_payment_orders.findFirst).toHaveBeenCalledWith({
      where: {
        payment_key: 'pay_test',
        merchant_id: 100n,
      },
    });
  });
});
