import { Test, TestingModule } from "@nestjs/testing";
import { DashboardService } from "../dashboard.service";
import { PrismaService } from "../../../prisma/prisma.service";

// ---- Mock Prisma ----
const mockPrisma = {
  merchants: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  agents: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  transactions: {
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  settlements: {
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  deposits: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  agent_settlements: {
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

describe("DashboardService", () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  // ================================================================
  // getSummary
  // ================================================================
  describe("getSummary", () => {
    it("기본 요약 데이터를 반환한다", async () => {
      mockPrisma.$transaction.mockResolvedValue([
        5,   // totalMerchants
        3,   // totalAgents
        100, // transactionCount
        { _sum: { amount: BigInt(5000000) } },    // transactionAmountAgg
        { _sum: { payout_amount: BigInt(4000000) } }, // settlementAmountAgg
        { _sum: { amount: BigInt(4500000) } },    // depositAmountAgg
        2,   // pendingSettlementCount
        1,   // unmatchedDepositCount
      ]);

      const result = await service.getSummary({});

      expect(result.totalMerchants).toBe(5);
      expect(result.totalAgents).toBe(3);
      expect(result.transactionCount).toBe(100);
      expect(result.totalTransactionAmount).toBe("5000000");
      expect(result.totalSettlementAmount).toBe("4000000");
      expect(result.totalDepositAmount).toBe("4500000");
      expect(result.pendingSettlementCount).toBe(2);
      expect(result.unmatchedDepositCount).toBe(1);
    });

    it("금액이 null이면 '0'으로 반환된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([
        0, 0, 0,
        { _sum: { amount: null } },
        { _sum: { payout_amount: null } },
        { _sum: { amount: null } },
        0, 0,
      ]);

      const result = await service.getSummary({});

      expect(result.totalTransactionAmount).toBe("0");
      expect(result.totalSettlementAmount).toBe("0");
      expect(result.totalDepositAmount).toBe("0");
    });

    it("기간 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([
        0, 0, 0,
        { _sum: { amount: null } },
        { _sum: { payout_amount: null } },
        { _sum: { amount: null } },
        0, 0,
      ]);

      await service.getSummary({ startDate: "2024-01-01", endDate: "2024-01-31" });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // getTransactionStats
  // ================================================================
  describe("getTransactionStats", () => {
    it("상태별 그룹핑 + 결제수단별 그룹핑을 반환한다", async () => {
      mockPrisma.transactions.groupBy
        .mockResolvedValueOnce([
          { status: "APPROVED", _count: { id: 80 }, _sum: { amount: BigInt(4000000) } },
          { status: "CANCELLED", _count: { id: 20 }, _sum: { amount: BigInt(0) } },
        ])
        .mockResolvedValueOnce([
          { payment_method: "CARD", _count: { id: 70 }, _sum: { amount: BigInt(3500000) } },
          { payment_method: "BANK_TRANSFER", _count: { id: 10 }, _sum: { amount: BigInt(500000) } },
        ]);

      const result = await service.getTransactionStats({});

      expect(result.byStatus).toHaveLength(2);
      expect(result.byStatus[0]).toMatchObject({
        status: "APPROVED",
        count: 80,
        totalAmount: "4000000",
      });
      expect(result.byPaymentMethod).toHaveLength(2);
      expect(result.byPaymentMethod[0]).toMatchObject({
        paymentMethod: "CARD",
        count: 70,
        totalAmount: "3500000",
      });
    });

    it("금액이 null이면 '0'으로 반환된다", async () => {
      mockPrisma.transactions.groupBy
        .mockResolvedValueOnce([
          { status: "APPROVED", _count: { id: 0 }, _sum: { amount: null } },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getTransactionStats({});

      expect(result.byStatus[0].totalAmount).toBe("0");
    });
  });

  // ================================================================
  // getSettlementStats
  // ================================================================
  describe("getSettlementStats", () => {
    it("정산 상태별 그룹핑 + 금액 합계를 반환한다", async () => {
      mockPrisma.settlements.groupBy.mockResolvedValue([
        { status: "CONFIRMED", _count: { id: 5 }, _sum: { total_net: BigInt(500000) } },
        { status: "COMPLETED", _count: { id: 10 }, _sum: { total_net: BigInt(1000000) } },
      ]);

      const result = await service.getSettlementStats({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        status: "CONFIRMED",
        count: 5,
        totalNetAmount: "500000",
      });
    });

    it("금액이 null이면 '0'으로 반환된다", async () => {
      mockPrisma.settlements.groupBy.mockResolvedValue([
        { status: "CALCULATED", _count: { id: 3 }, _sum: { total_net: null } },
      ]);

      const result = await service.getSettlementStats({});

      expect(result[0].totalNetAmount).toBe("0");
    });
  });

  // ================================================================
  // getDailyTrend
  // ================================================================
  describe("getDailyTrend", () => {
    it("날짜별 거래 건수 + 금액 배열을 반환한다", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date("2024-01-15"), count: BigInt(10), amount: BigInt(1000000) },
        { date: new Date("2024-01-16"), count: BigInt(8), amount: BigInt(800000) },
      ]);

      const result = await service.getDailyTrend({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        date: "2024-01-15",
        count: 10,
        amount: "1000000",
      });
    });

    it("데이터가 없으면 빈 배열을 반환한다", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailyTrend({
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });

      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // getTopMerchants
  // ================================================================
  describe("getTopMerchants", () => {
    it("거래금액 상위 가맹점을 반환한다", async () => {
      mockPrisma.transactions.groupBy.mockResolvedValue([
        {
          merchant_id: "merchant-uuid-1",
          _count: { id: 50 },
          _sum: { amount: BigInt(5000000) },
        },
        {
          merchant_id: "merchant-uuid-2",
          _count: { id: 30 },
          _sum: { amount: BigInt(3000000) },
        },
      ]);
      mockPrisma.merchants.findMany.mockResolvedValue([
        { id: "merchant-uuid-1", merchant_code: "M001", merchant_name: "가맹점A" },
        { id: "merchant-uuid-2", merchant_code: "M002", merchant_name: "가맹점B" },
      ]);

      const result = await service.getTopMerchants({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        merchantId: "merchant-uuid-1",
        merchantName: "가맹점A",
        merchantCode: "M001",
        totalAmount: "5000000",
        transactionCount: 50,
      });
    });

    it("거래 데이터가 없으면 빈 배열을 반환한다", async () => {
      mockPrisma.transactions.groupBy.mockResolvedValue([]);

      const result = await service.getTopMerchants({});

      expect(result).toEqual([]);
      expect(mockPrisma.merchants.findMany).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // getTopAgents
  // ================================================================
  describe("getTopAgents", () => {
    it("커미션 상위 대리점을 반환한다", async () => {
      mockPrisma.agent_settlements.groupBy.mockResolvedValue([
        {
          agent_id: "agent-uuid-1",
          _count: { id: 5 },
          _sum: { total_commission: BigInt(200000) },
        },
      ]);
      mockPrisma.agents.findMany.mockResolvedValue([
        { id: "agent-uuid-1", agent_code: "A001", agent_name: "대리점A" },
      ]);

      const result = await service.getTopAgents({});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        agentId: "agent-uuid-1",
        agentName: "대리점A",
        agentCode: "A001",
        totalCommission: "200000",
        settlementCount: 5,
      });
    });

    it("대리점 정산 데이터가 없으면 빈 배열을 반환한다", async () => {
      mockPrisma.agent_settlements.groupBy.mockResolvedValue([]);

      const result = await service.getTopAgents({});

      expect(result).toEqual([]);
      expect(mockPrisma.agents.findMany).not.toHaveBeenCalled();
    });
  });
});
