import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DepositsService } from "../deposits.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  deposits: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deposit_transactions: {
    findUnique: jest.fn(),
    createMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  transactions: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makeDeposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep-uuid-1",
  deposit_date: new Date("2024-01-15"),
  source: "CARD_COMPANY_A",
  amount: BigInt(300000),
  reconcile_status: "PENDING",
  matched_amount: BigInt(0),
  unmatched_amount: BigInt(300000),
  created_at: new Date(),
  updated_at: new Date(),
  created_by: "admin-uuid-1",
  updated_by: null,
  deposit_transactions: [],
  ...overrides,
});

const makeDepositTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: "dt-uuid-1",
  deposit_id: "dep-uuid-1",
  transaction_id: "txn-uuid-1",
  matched_amount: BigInt(100000),
  created_at: new Date(),
  ...overrides,
});

const makeTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: "txn-uuid-1",
  tran_no: "TXN20240115001",
  amount: BigInt(100000),
  fee_amount: BigInt(3000),
  status: "APPROVED",
  approved_at: new Date("2024-01-15"),
  merchant_id: "merchant-uuid-1",
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("DepositsService", () => {
  let service: DepositsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<DepositsService>(DepositsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 조회 - 페이지네이션 메타데이터를 반환한다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[makeDeposit()], 1]);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it("source 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ source: "CARD_COMPANY_A" });

      expect(mockPrisma.deposits.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: "CARD_COMPANY_A" }),
        }),
      );
    });

    it("reconcileStatus 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ reconcileStatus: "PENDING" });

      expect(mockPrisma.deposits.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reconcile_status: "PENDING" }),
        }),
      );
    });

    it("날짜 범위 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ startDate: "2024-01-01", endDate: "2024-01-31" });

      expect(mockPrisma.deposits.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deposit_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it("limit이 MAX_LIMIT(100)을 초과하면 100으로 제한된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ limit: 200 });

      expect(result.meta.limit).toBe(100);
    });
  });

  // ================================================================
  // findOne
  // ================================================================
  describe("findOne", () => {
    it("정상적으로 입금 내역을 반환한다", async () => {
      const deposit = makeDeposit();
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);

      const result = await service.findOne("dep-uuid-1");

      expect(result).toEqual(deposit);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockPrisma.deposits.findUnique.mockResolvedValue(null);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // create
  // ================================================================
  describe("create", () => {
    it("정상적으로 입금 내역을 생성한다", async () => {
      const created = makeDeposit();
      mockPrisma.deposits.create.mockResolvedValue(created);

      const dto = {
        depositDate: "2024-01-15",
        source: "CARD_COMPANY_A",
        amount: 300000,
      };
      const result = await service.create(dto, ADMIN_ID);

      expect(result).toEqual(created);
    });

    it("unmatched_amount가 amount와 동일하게 초기 설정된다", async () => {
      mockPrisma.deposits.create.mockResolvedValue(makeDeposit());

      await service.create(
        { depositDate: "2024-01-15", source: "BANK_A", amount: 500000 },
        ADMIN_ID,
      );

      const createCall = mockPrisma.deposits.create.mock.calls[0][0];
      expect(createCall.data.amount).toBe(BigInt(500000));
      expect(createCall.data.unmatched_amount).toBe(BigInt(500000));
    });
  });

  // ================================================================
  // reconcile (자동 대사)
  // ================================================================
  describe("reconcile", () => {
    it("완전 매칭 시 reconcile_status가 MATCHED로 변경된다", async () => {
      const deposit = makeDeposit({
        amount: BigInt(100000),
        matched_amount: BigInt(0),
        unmatched_amount: BigInt(100000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction({ amount: BigInt(100000) }),
      ]);

      const updatedDeposit = { ...deposit, reconcile_status: "MATCHED" };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.deposit_transactions.createMany.mockResolvedValue({ count: 1 });
        mockPrisma.deposits.update.mockResolvedValue(updatedDeposit);
        return fn(mockPrisma as unknown as typeof mockPrisma);
      });

      const result = await service.reconcile("dep-uuid-1", ADMIN_ID);

      expect(result.reconcile_status).toBe("MATCHED");
    });

    it("부분 매칭 시 reconcile_status가 MISMATCHED로 변경된다", async () => {
      const deposit = makeDeposit({
        amount: BigInt(300000),
        matched_amount: BigInt(0),
        unmatched_amount: BigInt(300000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);
      // 거래 금액 합계가 입금액보다 적음
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction({ amount: BigInt(100000) }),
      ]);

      const updatedDeposit = { ...deposit, reconcile_status: "MISMATCHED" };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.deposit_transactions.createMany.mockResolvedValue({ count: 1 });
        mockPrisma.deposits.update.mockResolvedValue(updatedDeposit);
        return fn(mockPrisma as unknown as typeof mockPrisma);
      });

      const result = await service.reconcile("dep-uuid-1", ADMIN_ID);

      expect(result.reconcile_status).toBe("MISMATCHED");
    });

    it("매칭할 거래가 없으면 deposit_transactions.createMany를 호출하지 않는다", async () => {
      const deposit = makeDeposit();
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);
      mockPrisma.transactions.findMany.mockResolvedValue([]);

      const updatedDeposit = { ...deposit, reconcile_status: "MISMATCHED" };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.deposits.update.mockResolvedValue(updatedDeposit);
        return fn(mockPrisma as unknown as typeof mockPrisma);
      });

      await service.reconcile("dep-uuid-1", ADMIN_ID);

      expect(mockPrisma.deposit_transactions.createMany).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // manualMatch (수동 매칭)
  // ================================================================
  describe("manualMatch", () => {
    it("정상적으로 수동 매칭을 생성한다", async () => {
      const deposit = makeDeposit({
        amount: BigInt(300000),
        matched_amount: BigInt(0),
        unmatched_amount: BigInt(300000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);

      const created = makeDepositTransaction();
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.deposit_transactions.create.mockResolvedValue(created);
        mockPrisma.deposits.update.mockResolvedValue(deposit);
        return fn(mockPrisma as unknown as typeof mockPrisma);
      });

      const result = await service.manualMatch(
        "dep-uuid-1",
        { transactionId: "txn-uuid-1", matchedAmount: 100000 },
        ADMIN_ID,
      );

      expect(result).toEqual(created);
    });

    it("매칭 금액이 unmatched_amount를 초과하면 BadRequestException을 던진다", async () => {
      const deposit = makeDeposit({
        unmatched_amount: BigInt(50000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);

      await expect(
        service.manualMatch(
          "dep-uuid-1",
          { transactionId: "txn-uuid-1", matchedAmount: 100000 },
          ADMIN_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("완전 매칭 시 reconcile_status가 MANUAL로 변경된다", async () => {
      const deposit = makeDeposit({
        amount: BigInt(100000),
        matched_amount: BigInt(0),
        unmatched_amount: BigInt(100000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);

      const updatedDeposit = { ...deposit, reconcile_status: "MANUAL" };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        mockPrisma.deposit_transactions.create.mockResolvedValue(
          makeDepositTransaction(),
        );
        mockPrisma.deposits.update.mockResolvedValue(updatedDeposit);
        return fn(mockPrisma as unknown as typeof mockPrisma);
      });

      await service.manualMatch(
        "dep-uuid-1",
        { transactionId: "txn-uuid-1", matchedAmount: 100000 },
        ADMIN_ID,
      );

      const updateCall = mockPrisma.deposits.update.mock.calls[0][0];
      expect(updateCall.data.reconcile_status).toBe("MANUAL");
    });
  });

  // ================================================================
  // unmatch
  // ================================================================
  describe("unmatch", () => {
    it("정상적으로 매칭을 해제하고 금액을 재계산한다", async () => {
      const deposit = makeDeposit({
        matched_amount: BigInt(100000),
        unmatched_amount: BigInt(200000),
      });
      mockPrisma.deposits.findUnique.mockResolvedValue(deposit);
      mockPrisma.deposit_transactions.findUnique.mockResolvedValue(
        makeDepositTransaction({ deposit_id: "dep-uuid-1" }),
      );
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.unmatch("dep-uuid-1", "dt-uuid-1", ADMIN_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("존재하지 않는 매칭 해제 시 NotFoundException을 던진다", async () => {
      mockPrisma.deposits.findUnique.mockResolvedValue(makeDeposit());
      mockPrisma.deposit_transactions.findUnique.mockResolvedValue(null);

      await expect(
        service.unmatch("dep-uuid-1", "non-existent", ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("다른 입금 내역의 매칭 해제 시도 시 NotFoundException을 던진다", async () => {
      mockPrisma.deposits.findUnique.mockResolvedValue(makeDeposit());
      mockPrisma.deposit_transactions.findUnique.mockResolvedValue(
        makeDepositTransaction({ deposit_id: "other-deposit-uuid" }),
      );

      await expect(
        service.unmatch("dep-uuid-1", "dt-uuid-1", ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
