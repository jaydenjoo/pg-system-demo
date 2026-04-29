import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { CommissionsService } from "../commissions.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Cache ----
const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ---- Mock Prisma ----
const mockPrisma = {
  pg_default_margins: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  agents: {
    findUnique: jest.fn(),
  },
  agent_commissions: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  merchants: {
    findUnique: jest.fn(),
  },
  merchant_commissions: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makePgMargin = (overrides: Record<string, unknown> = {}) => ({
  id: "pgm-uuid-1",
  payment_method: "CARD",
  card_company: null,
  margin_rate: "1.5000",
  min_fee: BigInt(100),
  effective_from: new Date(),
  effective_to: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: null,
  updated_by: null,
  ...overrides,
});

const makeAgentCommission = (overrides: Record<string, unknown> = {}) => ({
  id: "ac-uuid-1",
  agent_id: "agent-uuid-1",
  payment_method: "CARD",
  card_company: null,
  commission_rate: "2.5000",
  effective_from: new Date(),
  effective_to: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: null,
  updated_by: null,
  ...overrides,
});

const makeMerchantCommission = (overrides: Record<string, unknown> = {}) => ({
  id: "mc-uuid-1",
  merchant_id: "merchant-uuid-1",
  payment_method: "CARD",
  card_company: null,
  commission_rate: "3.0000",
  effective_from: new Date(),
  effective_to: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: null,
  updated_by: null,
  ...overrides,
});

const makeAgent = () => ({ id: "agent-uuid-1", agent_name: "테스트대리점" });
const makeMerchant = () => ({
  id: "merchant-uuid-1",
  merchant_name: "테스트가맹점",
  agent_id: "agent-uuid-1",
});

const ADMIN_ID = "admin-uuid-1";

describe("CommissionsService", () => {
  let service: CommissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // getPgMargins
  // ================================================================
  describe("getPgMargins", () => {
    it("기본 조회 - effective_to: null 조건으로 현재 유효한 마진만 반환한다", async () => {
      mockPrisma.pg_default_margins.findMany.mockResolvedValue([
        makePgMargin(),
      ]);

      const result = await service.getPgMargins();

      expect(mockPrisma.pg_default_margins.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ effective_to: null }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it("paymentMethod 필터가 적용된다", async () => {
      mockPrisma.pg_default_margins.findMany.mockResolvedValue([]);

      await service.getPgMargins({ paymentMethod: "CARD" });

      expect(mockPrisma.pg_default_margins.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment_method: "CARD" }),
        }),
      );
    });

    it("cardCompany 필터가 적용된다", async () => {
      mockPrisma.pg_default_margins.findMany.mockResolvedValue([]);

      await service.getPgMargins({ cardCompany: "삼성" });

      expect(mockPrisma.pg_default_margins.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ card_company: "삼성" }),
        }),
      );
    });
  });

  // ================================================================
  // setPgMargin
  // ================================================================
  describe("setPgMargin", () => {
    const dto = {
      paymentMethod: "CARD",
      marginRate: "1.5000",
      minFee: 100,
    };

    it("정상적으로 PG 마진을 설정한다", async () => {
      mockPrisma.pg_default_margins.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.pg_default_margins.create.mockResolvedValue(makePgMargin());
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.setPgMargin(dto, ADMIN_ID);

      expect(result).toBeDefined();
      expect(mockPrisma.pg_default_margins.create).toHaveBeenCalledTimes(1);
    });

    it("기존 마진을 만료시킨 후 새 마진을 생성한다", async () => {
      mockPrisma.pg_default_margins.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.pg_default_margins.create.mockResolvedValue(makePgMargin());
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      await service.setPgMargin(dto, ADMIN_ID);

      const updateCall =
        mockPrisma.pg_default_margins.updateMany.mock.calls[0][0];
      expect(updateCall.where).toMatchObject({
        payment_method: "CARD",
        effective_to: null,
      });
      expect(updateCall.data.effective_to).toBeInstanceOf(Date);
    });
  });

  // ================================================================
  // getAgentCommissions
  // ================================================================
  describe("getAgentCommissions", () => {
    it("대리점 수수료를 조회한다", async () => {
      mockPrisma.agent_commissions.findMany.mockResolvedValue([
        makeAgentCommission(),
      ]);

      const result = await service.getAgentCommissions("agent-uuid-1");

      expect(mockPrisma.agent_commissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agent_id: "agent-uuid-1",
            effective_to: null,
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ================================================================
  // setAgentCommission
  // ================================================================
  describe("setAgentCommission", () => {
    const dto = { paymentMethod: "CARD", commissionRate: "2.5000" };

    it("정상적으로 대리점 수수료를 설정한다", async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(makeAgent());
      mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);
      mockPrisma.agent_commissions.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.agent_commissions.create.mockResolvedValue(
        makeAgentCommission(),
      );
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.setAgentCommission(
        "agent-uuid-1",
        dto,
        ADMIN_ID,
      );

      expect(result).toBeDefined();
    });

    it("존재하지 않는 대리점이면 NotFoundException(AGENT_001)을 던진다", async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(null);

      await expect(
        service.setAgentCommission("non-existent", dto, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("PG 마진보다 낮은 수수료 설정 시 BadRequestException(STL_003)을 던진다", async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(makeAgent());
      mockPrisma.pg_default_margins.findFirst.mockResolvedValue(
        makePgMargin({ margin_rate: "3.0000" }), // PG margin = 3%, agent rate = 2.5% → 실패
      );

      await expect(
        service.setAgentCommission("agent-uuid-1", dto, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it("기존 수수료를 만료시킨다", async () => {
      mockPrisma.agents.findUnique.mockResolvedValue(makeAgent());
      mockPrisma.pg_default_margins.findFirst.mockResolvedValue(null);
      mockPrisma.agent_commissions.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.agent_commissions.create.mockResolvedValue(
        makeAgentCommission(),
      );
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      await service.setAgentCommission("agent-uuid-1", dto, ADMIN_ID);

      const updateCall =
        mockPrisma.agent_commissions.updateMany.mock.calls[0][0];
      expect(updateCall.where).toMatchObject({
        agent_id: "agent-uuid-1",
        effective_to: null,
      });
    });
  });

  // ================================================================
  // getMerchantCommissions
  // ================================================================
  describe("getMerchantCommissions", () => {
    it("가맹점 수수료를 조회한다", async () => {
      mockPrisma.merchant_commissions.findMany.mockResolvedValue([
        makeMerchantCommission(),
      ]);

      const result = await service.getMerchantCommissions("merchant-uuid-1");

      expect(mockPrisma.merchant_commissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchant_id: "merchant-uuid-1",
            effective_to: null,
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ================================================================
  // setMerchantCommission
  // ================================================================
  describe("setMerchantCommission", () => {
    const dto = { paymentMethod: "CARD", commissionRate: "3.0000" };

    it("정상적으로 가맹점 수수료를 설정한다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());
      mockPrisma.agent_commissions.findFirst.mockResolvedValue(null);
      mockPrisma.merchant_commissions.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.merchant_commissions.create.mockResolvedValue(
        makeMerchantCommission(),
      );
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        if (typeof fn === "function") return fn(mockPrisma);
        return fn;
      });

      const result = await service.setMerchantCommission(
        "merchant-uuid-1",
        dto,
        ADMIN_ID,
      );

      expect(result).toBeDefined();
    });

    it("존재하지 않는 가맹점이면 NotFoundException(MERCHANT_001)을 던진다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(null);

      await expect(
        service.setMerchantCommission("non-existent", dto, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("대리점 수수료보다 낮은 가맹점 수수료 설정 시 BadRequestException(STL_003)을 던진다", async () => {
      mockPrisma.merchants.findUnique.mockResolvedValue(makeMerchant());
      mockPrisma.agent_commissions.findFirst.mockResolvedValue(
        makeAgentCommission({ commission_rate: "5.0000" }), // agent = 5%, merchant = 3% → 실패
      );

      await expect(
        service.setMerchantCommission("merchant-uuid-1", dto, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ================================================================
  // getCommissionHistory
  // ================================================================
  describe("getCommissionHistory", () => {
    it("대리점 수수료 이력을 조회한다", async () => {
      mockPrisma.agent_commissions.findMany.mockResolvedValue([
        makeAgentCommission(),
        makeAgentCommission({ effective_to: new Date() }),
      ]);

      const result = await service.getCommissionHistory(
        "agent",
        "agent-uuid-1",
      );

      expect(result.entityType).toBe("agent");
      expect(result.data).toHaveLength(2);
    });

    it("가맹점 수수료 이력이 없으면 빈 배열을 반환한다", async () => {
      mockPrisma.merchant_commissions.findMany.mockResolvedValue([]);

      const result = await service.getCommissionHistory(
        "merchant",
        "merchant-uuid-1",
      );

      expect(result.entityType).toBe("merchant");
      expect(result.data).toHaveLength(0);
    });
  });
});
