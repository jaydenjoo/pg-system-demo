import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { TransactionsService } from "../transactions.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Security ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Mock Prisma ----
const mockPrisma = {
  transactions: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  merchants: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---- Fixture helpers ----
const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
  id: "merchant-uuid-1",
  merchant_code: "MERCH001",
  merchant_name: "테스트가맹점",
  status: "ACTIVE",
  agent_id: "agent-uuid-1",
  ...overrides,
});

const makeTxn = (overrides: Record<string, unknown> = {}) => ({
  id: "txn-uuid-1",
  tran_no: "TXN123456789",
  merchant_id: "merchant-uuid-1",
  tran_type: "PAYMENT",
  payment_method: "CARD",
  status: "APPROVED",
  amount: BigInt(10000),
  fee_amount: BigInt(300),
  net_amount: BigInt(9700),
  vat_amount: BigInt(909),
  payment_detail: {},
  approved_at: new Date(),
  cancelled_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  merchants: { merchant_name: "테스트가맹점", merchant_code: "MERCH001" },
  merchant_terminals: null,
  original_transaction: null,
  cancel_transactions: [],
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("TransactionsService", () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 페이지네이션으로 목록을 반환한다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeTxn()], 1]);

      const result = await service.findAll({});

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(result.data).toHaveLength(1);
    });

    it("merchantId 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ merchantId: "merchant-uuid-1" });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchant_id: "merchant-uuid-1" }),
        }),
      );
    });

    it("agentId 필터가 merchants.agent_id로 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ agentId: "agent-uuid-1" });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchants: { agent_id: "agent-uuid-1" },
          }),
        }),
      );
    });

    it("status 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ status: "CANCELLED" });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "CANCELLED" }),
        }),
      );
    });

    it("paymentMethod 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ paymentMethod: "CARD" });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment_method: "CARD" }),
        }),
      );
    });

    it("날짜 범위 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approved_at: {
              gte: new Date("2025-01-01"),
              lte: new Date("2025-01-31"),
            },
          }),
        }),
      );
    });

    it("search 필터가 tran_no contains로 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ search: "TXN123" });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tran_no: { contains: "TXN123", mode: "insensitive" },
          }),
        }),
      );
    });

    it("페이지네이션이 올바르게 계산된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ page: 2, limit: 10 });

      expect(mockPrisma.transactions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ================================================================
  // findOne
  // ================================================================
  describe("findOne", () => {
    it("거래를 조회하고 반환한다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(makeTxn());

      const result = await service.findOne("txn-uuid-1");

      expect(result.id).toBe("txn-uuid-1");
    });

    it("존재하지 않으면 NotFoundException(TXN_001)을 던진다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(null);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // create
  // ================================================================
  describe("create", () => {
    const createDto = {
      merchantId: "merchant-uuid-1",
      transactionType: "PAYMENT",
      paymentMethod: "CARD",
      amount: 10000,
      feeAmount: 300,
      orderNo: "ORD-001",
      orderName: "테스트상품",
    };

    it("정상적으로 거래를 생성한다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());
      mockPrisma.transactions.create.mockResolvedValue(makeTxn());

      const result = await service.create(createDto, ADMIN_ID);

      expect(result).toBeDefined();
    });

    it("order_no, order_name이 payment_detail에 저장된다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());
      mockPrisma.transactions.create.mockResolvedValue(makeTxn());

      await service.create(createDto, ADMIN_ID);

      const createCall = mockPrisma.transactions.create.mock.calls[0][0];
      expect(createCall.data.payment_detail).toMatchObject({
        orderNo: "ORD-001",
        orderName: "테스트상품",
      });
    });

    it("비활성 가맹점이면 ConflictException(MERCHANT_003)을 던진다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(
        makeMerchant({ status: "SUSPENDED" }),
      );

      await expect(service.create(createDto, ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("존재하지 않는 가맹점이면 NotFoundException(MERCHANT_001)을 던진다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("수수료가 거래금액을 초과하면 BadRequestException(TXN_002)을 던진다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());

      await expect(
        service.create({ ...createDto, amount: 100, feeAmount: 200 }, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it("vat_amount가 BigInt 연산으로 자동 계산된다 (amount / 11)", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());
      mockPrisma.transactions.create.mockResolvedValue(makeTxn());

      await service.create({ ...createDto, amount: 11000 }, ADMIN_ID);

      const createCall = mockPrisma.transactions.create.mock.calls[0][0];
      expect(createCall.data.vat_amount).toBe(BigInt(1000));
    });
  });

  // ================================================================
  // cancel
  // ================================================================
  describe("cancel", () => {
    const cancelDto = { reason: "고객 요청" };

    it("정상적으로 거래를 취소한다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(makeTxn());
      mockPrisma.transactions.update.mockResolvedValue(
        makeTxn({ status: "CANCELLED" }),
      );

      const result = await service.cancel("txn-uuid-1", cancelDto, ADMIN_ID);

      expect(mockPrisma.transactions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.status).toBe("CANCELLED");
    });

    it("취소 사유가 payment_detail에 저장된다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(makeTxn());
      mockPrisma.transactions.update.mockResolvedValue(
        makeTxn({ status: "CANCELLED" }),
      );

      await service.cancel("txn-uuid-1", cancelDto, ADMIN_ID);

      const updateCall = mockPrisma.transactions.update.mock.calls[0][0];
      expect(updateCall.data.payment_detail).toMatchObject({
        cancelReason: "고객 요청",
      });
    });

    it("이미 취소된 거래이면 ConflictException(TXN_003)을 던진다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(
        makeTxn({ status: "CANCELLED" }),
      );

      await expect(
        service.cancel("txn-uuid-1", cancelDto, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
    });

    it("미승인(PENDING) 거래는 취소할 수 없다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(
        makeTxn({ status: "PENDING" }),
      );

      await expect(
        service.cancel("txn-uuid-1", cancelDto, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
    });

    it("존재하지 않는 거래 취소는 NotFoundException을 던진다", async () => {
      mockPrisma.transactions.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel("non-existent", cancelDto, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
