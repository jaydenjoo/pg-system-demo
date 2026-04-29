// ============================================================
// 결제 주문 서비스 단위 테스트
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentOrderService } from '../services/payment-order.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

// ---- 픽스처 팩토리 ----
const makePaymentOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-uuid-1',
  payment_key: 'pay-key-uuid-1',
  order_id: 'ORDER-001',
  merchant_id: 'merchant-uuid-1',
  api_key_id: 'api-key-uuid-1',
  transaction_id: null,
  amount: BigInt(10000),
  order_name: '테스트 상품',
  status: 'READY',
  payment_method: null,
  customer_email: null,
  customer_name: null,
  success_url: null,
  fail_url: null,
  cancel_reason: null,
  cancel_amount: null,
  approved_at: null,
  expires_at: new Date(Date.now() + 30 * 60 * 1000),
  created_at: new Date('2024-01-01T10:00:00Z'),
  updated_at: new Date('2024-01-01T10:00:00Z'),
  ...overrides,
});

const makeDto = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'ORDER-001',
  amount: 10000,
  orderName: '테스트 상품',
  ...overrides,
});

describe('PaymentOrderService', () => {
  let service: PaymentOrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentOrderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PaymentOrderService>(PaymentOrderService);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // createPaymentOrder
  // ---------------------------------------------------------------
  describe('createPaymentOrder', () => {
    it('정상 생성 후 PaymentOrderResponse 형태를 반환한다', async () => {
      mockPrisma.pg_payment_orders.create.mockResolvedValue(makePaymentOrder());

      const result = await service.createPaymentOrder(
        makeDto(),
        'merchant-uuid-1',
        'api-key-uuid-1',
      );

      expect(result.paymentKey).toBe('pay-key-uuid-1');
      expect(result.orderId).toBe('ORDER-001');
      expect(result.status).toBe('READY');
      expect(result.amount).toBe(10000);
      expect(typeof result.amount).toBe('number');
      expect(result.approvedAt).toBeNull();
      expect(result.requestedAt).toBeDefined();
    });

    it('amount가 0 이하이면 BadRequestException을 던진다', async () => {
      await expect(
        service.createPaymentOrder(
          makeDto({ amount: 0 }),
          'merchant-uuid-1',
          'api-key-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('amount가 음수이면 BadRequestException을 던진다', async () => {
      await expect(
        service.createPaymentOrder(
          makeDto({ amount: -100 }),
          'merchant-uuid-1',
          'api-key-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('중복 orderId + 동일 merchantId이면 ConflictException을 던진다', async () => {
      // Prisma P2002 unique constraint violation 시뮬레이션
      mockPrisma.pg_payment_orders.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createPaymentOrder(
          makeDto(),
          'merchant-uuid-1',
          'api-key-uuid-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('expires_at이 생성 시각 +30분이다', async () => {
      jest.useFakeTimers();
      const now = new Date('2024-06-15T09:00:00Z');
      jest.setSystemTime(now);

      mockPrisma.pg_payment_orders.create.mockImplementation(
        (args: { data: { expires_at: Date } }) =>
          Promise.resolve(makePaymentOrder({ expires_at: args.data.expires_at })),
      );

      await service.createPaymentOrder(
        makeDto(),
        'merchant-uuid-1',
        'api-key-uuid-1',
      );

      const createCall = mockPrisma.pg_payment_orders.create.mock
        .calls[0][0] as { data: { expires_at: Date } };
      const expiresAt = createCall.data.expires_at;
      const expected = new Date(now.getTime() + 30 * 60 * 1000);
      expect(expiresAt.getTime()).toBe(expected.getTime());

      jest.useRealTimers();
    });
  });

  // ---------------------------------------------------------------
  // getByPaymentKey
  // ---------------------------------------------------------------
  describe('getByPaymentKey', () => {
    it('paymentKey로 결제 주문을 조회하여 반환한다', async () => {
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makePaymentOrder());

      const result = await service.getByPaymentKey(
        'pay-key-uuid-1',
        'merchant-uuid-1',
      );

      expect(result.paymentKey).toBe('pay-key-uuid-1');
      expect(result.orderId).toBe('ORDER-001');
    });

    it('다른 merchantId로 조회하면 NotFoundException을 던진다 (격리)', async () => {
      // merchant_id 조건 불충족 → Prisma null 반환
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

      await expect(
        service.getByPaymentKey('pay-key-uuid-1', 'other-merchant-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('존재하지 않는 paymentKey이면 NotFoundException을 던진다', async () => {
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

      await expect(
        service.getByPaymentKey('non-existent-key', 'merchant-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // getByOrderId
  // ---------------------------------------------------------------
  describe('getByOrderId', () => {
    it('orderId로 결제 주문을 조회하여 반환한다', async () => {
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(makePaymentOrder());

      const result = await service.getByOrderId('ORDER-001', 'merchant-uuid-1');

      expect(result.orderId).toBe('ORDER-001');
      expect(result.paymentKey).toBe('pay-key-uuid-1');
    });

    it('존재하지 않는 orderId이면 NotFoundException을 던진다', async () => {
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(null);

      await expect(
        service.getByOrderId('NON-EXISTENT', 'merchant-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // BigInt → number 변환 정확성
  // ---------------------------------------------------------------
  describe('toResponse (BigInt → number 변환)', () => {
    it('BigInt amount가 정확히 number로 변환된다', async () => {
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
        makePaymentOrder({ amount: BigInt(99999) }),
      );

      const result = await service.getByPaymentKey(
        'pay-key-uuid-1',
        'merchant-uuid-1',
      );

      expect(result.amount).toBe(99999);
      expect(typeof result.amount).toBe('number');
    });

    it('approved_at이 있으면 ISO string으로 변환된다', async () => {
      const approvedAt = new Date('2024-01-01T12:00:00Z');
      mockPrisma.pg_payment_orders.findUnique.mockResolvedValue(
        makePaymentOrder({ approved_at: approvedAt }),
      );

      const result = await service.getByPaymentKey(
        'pay-key-uuid-1',
        'merchant-uuid-1',
      );

      expect(result.approvedAt).toBe('2024-01-01T12:00:00.000Z');
    });
  });
});
