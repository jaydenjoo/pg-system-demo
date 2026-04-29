import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import { SettlementsService } from "../settlements.service";
import { SETTLEMENT_QUEUE } from "../settlement.processor";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  settlements: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  agent_settlements: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  transactions: {
    findMany: jest.fn(),
  },
  merchants: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
};

// ---- Fixture helpers ----
const makeSettlement = (overrides: Record<string, unknown> = {}) => ({
  id: "stl-uuid-1",
  merchant_id: "merchant-uuid-1",
  settlement_date: new Date("2024-01-31"),
  period_from: new Date("2024-01-01"),
  period_to: new Date("2024-01-31"),
  total_amount: BigInt(1000000),
  total_fee: BigInt(30000),
  total_net: BigInt(970000),
  deduction: BigInt(0),
  payout_amount: BigInt(970000),
  tran_count: 10,
  cancel_count: 0,
  status: "CALCULATED",
  remitted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: "admin-uuid-1",
  updated_by: null,
  merchants: { merchant_name: "테스트가맹점", merchant_code: "M001" },
  ...overrides,
});

const makeAgentSettlement = (overrides: Record<string, unknown> = {}) => ({
  id: "astl-uuid-1",
  agent_id: "agent-uuid-1",
  settlement_date: new Date("2024-01-31"),
  period_from: new Date("2024-01-01"),
  period_to: new Date("2024-01-31"),
  total_commission: BigInt(30000),
  tran_count: 10,
  status: "CALCULATED",
  remitted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: "admin-uuid-1",
  updated_by: null,
  agents: { agent_name: "테스트대리점", agent_code: "A001" },
  ...overrides,
});

const makeTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: "txn-uuid-1",
  merchant_id: "merchant-uuid-1",
  amount: BigInt(100000),
  fee_amount: BigInt(3000),
  tran_type: "PAYMENT",
  status: "APPROVED",
  approved_at: new Date("2024-01-15"),
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("SettlementsService", () => {
  let service: SettlementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: getQueueToken(SETTLEMENT_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 조회 - 페이지네이션 메타데이터를 반환한다", async () => {
      const settlements = [makeSettlement()];
      mockPrisma.$transaction.mockResolvedValue([settlements, 1]);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it("merchantId 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ merchantId: "merchant-uuid-1" });

      expect(mockPrisma.settlements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchant_id: "merchant-uuid-1" }),
        }),
      );
    });

    it("agentId 필터가 merchants 관계를 통해 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ agentId: "agent-uuid-1" });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("status 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ status: "CONFIRMED" });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("날짜 범위 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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
    it("정상적으로 정산을 반환한다", async () => {
      const settlement = makeSettlement();
      mockPrisma.settlements.findUnique.mockResolvedValue(settlement);

      const result = await service.findOne("stl-uuid-1");

      expect(result).toEqual(settlement);
      expect(mockPrisma.settlements.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "stl-uuid-1" } }),
      );
    });

    it("존재하지 않으면 NotFoundException(STL_001)을 던진다", async () => {
      mockPrisma.settlements.findUnique.mockResolvedValue(null);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // calculate
  // ================================================================
  describe("calculate", () => {
    const dto = {
      settlementDate: "2024-01-31",
      periodFrom: "2024-01-01",
      periodTo: "2024-01-31",
    };

    it("정상적으로 정산을 계산하여 생성한다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(0);
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction(),
        makeTransaction({
          id: "txn-uuid-2",
          amount: BigInt(200000),
          fee_amount: BigInt(6000),
        }),
      ]);
      mockPrisma.merchants.findMany.mockResolvedValue([
        { id: "merchant-uuid-1", agent_id: "agent-uuid-1" },
      ]);
      mockPrisma.settlements.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.agent_settlements.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.calculate(dto, ADMIN_ID);

      expect(result).toEqual({ merchantSettlements: 1, agentSettlements: 1 });
      expect(mockPrisma.settlements.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.agent_settlements.createMany).toHaveBeenCalledTimes(1);
    });

    it("기간 내 거래가 없으면 0/0을 반환하고 createMany를 호출하지 않는다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(0);
      mockPrisma.transactions.findMany.mockResolvedValue([]);

      const result = await service.calculate(dto, ADMIN_ID);

      expect(result).toEqual({ merchantSettlements: 0, agentSettlements: 0 });
      expect(mockPrisma.settlements.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.agent_settlements.createMany).not.toHaveBeenCalled();
    });

    it("이미 해당 일자 정산이 존재하면 ConflictException(STL_002)을 던진다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(1);

      await expect(service.calculate(dto, ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("여러 가맹점의 거래를 올바르게 그룹핑하여 정산한다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(0);
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction({ merchant_id: "m-1" }),
        makeTransaction({ id: "t-2", merchant_id: "m-2" }),
        makeTransaction({ id: "t-3", merchant_id: "m-2" }),
      ]);
      mockPrisma.merchants.findMany.mockResolvedValue([
        { id: "m-1", agent_id: "a-1" },
        { id: "m-2", agent_id: "a-1" },
      ]);
      mockPrisma.settlements.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.agent_settlements.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.calculate(dto, ADMIN_ID);

      // 2 merchants, 1 agent
      expect(result).toEqual({ merchantSettlements: 2, agentSettlements: 1 });

      const createManyCall = mockPrisma.settlements.createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(2);
    });

    it("취소 거래는 cancel_count에 집계되고 total_amount에서 제외되지 않는다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(0);
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction({ tran_type: "PAYMENT" }),
        makeTransaction({ id: "t-2", tran_type: "CANCEL" }),
      ]);
      mockPrisma.merchants.findMany.mockResolvedValue([
        { id: "merchant-uuid-1", agent_id: "agent-uuid-1" },
      ]);
      mockPrisma.settlements.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.agent_settlements.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      await service.calculate(dto, ADMIN_ID);

      const createManyCall = mockPrisma.settlements.createMany.mock.calls[0][0];
      const row = createManyCall.data[0];
      expect(row.tran_count).toBe(1);
      expect(row.cancel_count).toBe(1);
    });

    it("여러 대리점에 속한 가맹점이면 대리점별로 수수료가 집계된다", async () => {
      mockPrisma.settlements.count.mockResolvedValue(0);
      mockPrisma.transactions.findMany.mockResolvedValue([
        makeTransaction({ merchant_id: "m-1" }),
        makeTransaction({ id: "t-2", merchant_id: "m-2" }),
      ]);
      mockPrisma.merchants.findMany.mockResolvedValue([
        { id: "m-1", agent_id: "a-1" },
        { id: "m-2", agent_id: "a-2" },
      ]);
      mockPrisma.settlements.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.agent_settlements.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.calculate(dto, ADMIN_ID);

      expect(result.agentSettlements).toBe(2);
    });
  });

  // ================================================================
  // confirm
  // ================================================================
  describe("confirm", () => {
    it("CALCULATED 상태 정산을 CONFIRMED로 변경한다", async () => {
      const settlement = makeSettlement({ status: "CALCULATED" });
      mockPrisma.settlements.findUnique.mockResolvedValue(settlement);
      mockPrisma.settlements.update.mockResolvedValue({
        ...settlement,
        status: "CONFIRMED",
        updated_by: ADMIN_ID,
      });

      const result = await service.confirm("stl-uuid-1", ADMIN_ID);

      expect(mockPrisma.settlements.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "stl-uuid-1" },
          data: expect.objectContaining({
            status: "CONFIRMED",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.status).toBe("CONFIRMED");
    });

    it("CALCULATED가 아닌 정산을 확정하려 하면 ConflictException(STL_002)을 던진다", async () => {
      mockPrisma.settlements.findUnique.mockResolvedValue(
        makeSettlement({ status: "CONFIRMED" }),
      );

      await expect(service.confirm("stl-uuid-1", ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ================================================================
  // complete
  // ================================================================
  describe("complete", () => {
    it("CONFIRMED 상태 정산을 REMITTED로 변경하고 remitted_at을 기록한다", async () => {
      const now = new Date();
      const settlement = makeSettlement({ status: "CONFIRMED" });
      mockPrisma.settlements.findUnique.mockResolvedValue(settlement);
      mockPrisma.settlements.update.mockResolvedValue({
        ...settlement,
        status: "REMITTED",
        remitted_at: now,
        updated_by: ADMIN_ID,
      });

      const result = await service.complete("stl-uuid-1", ADMIN_ID);

      const updateCall = mockPrisma.settlements.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe("REMITTED");
      expect(updateCall.data.remitted_at).toBeInstanceOf(Date);
      expect(result.status).toBe("REMITTED");
    });

    it("CONFIRMED가 아닌 정산을 완료하려 하면 ConflictException(STL_002)을 던진다", async () => {
      mockPrisma.settlements.findUnique.mockResolvedValue(
        makeSettlement({ status: "CALCULATED" }),
      );

      await expect(service.complete("stl-uuid-1", ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ================================================================
  // getAgentSettlements
  // ================================================================
  describe("getAgentSettlements", () => {
    it("대리점 정산 목록을 페이지네이션과 함께 반환한다", async () => {
      const agentSettlements = [makeAgentSettlement()];
      mockPrisma.$transaction.mockResolvedValue([agentSettlements, 1]);

      const result = await service.getAgentSettlements({});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1 });
    });

    it("agentId 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAgentSettlements({ agentId: "agent-uuid-1" });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // getAgentSettlementDetail
  // ================================================================
  describe("getAgentSettlementDetail", () => {
    it("정상적으로 대리점 정산을 반환한다", async () => {
      const settlement = makeAgentSettlement();
      mockPrisma.agent_settlements.findUnique.mockResolvedValue(settlement);

      const result = await service.getAgentSettlementDetail("astl-uuid-1");

      expect(result).toEqual(settlement);
    });

    it("존재하지 않으면 NotFoundException(STL_001)을 던진다", async () => {
      mockPrisma.agent_settlements.findUnique.mockResolvedValue(null);

      await expect(
        service.getAgentSettlementDetail("non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
