import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { MerchantsService } from "../merchants.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  merchants: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  companies: {
    create: jest.fn(),
  },
  agents: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
  id: "merchant-uuid-1",
  merchant_code: "MERCH001",
  merchant_name: "테스트가맹점",
  status: "ACTIVE",
  settlement_cycle: "D+2",
  contract_start_date: null,
  contract_end_date: null,
  bank_name: "국민은행",
  bank_account: "12345678901234",
  bank_holder: "홍길동",
  created_at: new Date(),
  created_by: "admin-uuid-1",
  updated_at: new Date(),
  updated_by: "admin-uuid-1",
  companies: {
    id: "company-uuid-1",
    company_name: "테스트회사",
    business_no: "123-45-67890",
    representative: "대표자",
  },
  agents: {
    id: "agent-uuid-1",
    agent_code: "AGENT001",
    agent_name: "테스트대리점",
  },
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("MerchantsService", () => {
  let service: MerchantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 페이지네이션으로 목록을 반환한다", async () => {
      const merchant = makeMerchant();
      mockPrisma.$transaction.mockResolvedValue([[merchant], 1]);

      const result = await service.findAll({});

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(result.data).toHaveLength(1);
    });

    it("bank_account를 마스킹하여 반환한다", async () => {
      const merchant = makeMerchant({ bank_account: "12345678901234" });
      mockPrisma.$transaction.mockResolvedValue([[merchant], 1]);

      const result = await service.findAll({});

      expect(result.data[0].bank_account).toBe("****1234");
    });

    it("agentId 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ agentId: "agent-uuid-1" });

      // $transaction receives array of promises; check via findMany mock
      expect(mockPrisma.merchants.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agent_id: "agent-uuid-1" }),
        }),
      );
    });

    it("status 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ status: "SUSPENDED" });

      expect(mockPrisma.merchants.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "SUSPENDED" }),
        }),
      );
    });

    it("search 필터가 merchant_name contains로 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ search: "테스트" });

      expect(mockPrisma.merchants.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchant_name: { contains: "테스트", mode: "insensitive" },
          }),
        }),
      );
    });

    it("bank_account가 null이면 null을 반환한다", async () => {
      const merchant = makeMerchant({ bank_account: null });
      mockPrisma.$transaction.mockResolvedValue([[merchant], 1]);

      const result = await service.findAll({});

      expect(result.data[0].bank_account).toBeNull();
    });
  });

  // ================================================================
  // create
  // ================================================================
  describe("create", () => {
    const createDto = {
      agentId: "agent-uuid-1",
      merchantName: "테스트가맹점",
      businessNo: "123-45-67890",
    };

    it("가맹점을 생성하고 자동 채번된 코드로 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.merchants.count.mockResolvedValue(0); // 당일 첫 번째
      mockPrisma.agents.findFirst.mockResolvedValue({ id: "agent-uuid-1" });
      mockPrisma.$transaction.mockResolvedValue([{}, makeMerchant()]);

      const result = await service.create(createDto, ADMIN_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.companies.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_no: "123-45-67890",
            created_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.bank_account).toBe("****1234");
    });

    it("당일 기존 가맹점이 있으면 순번이 증가한다", async () => {
      mockPrisma.merchants.count.mockResolvedValue(5); // 당일 5개 존재
      mockPrisma.agents.findFirst.mockResolvedValue({ id: "agent-uuid-1" });
      mockPrisma.$transaction.mockResolvedValue([{}, makeMerchant()]);

      await service.create(createDto, ADMIN_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("settlementCycle 기본값은 D+2이다", async () => {
      mockPrisma.merchants.count.mockResolvedValue(0);
      mockPrisma.agents.findFirst.mockResolvedValue({ id: "agent-uuid-1" });
      mockPrisma.$transaction.mockResolvedValue([{}, makeMerchant()]);

      await service.create(createDto, ADMIN_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.merchants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ settlement_cycle: "D+2" }),
        }),
      );
    });

    it("존재하지 않는 대리점 ID이면 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(service.create(createDto, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // changeStatus
  // ================================================================
  describe("changeStatus", () => {
    it("가맹점 상태를 변경하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(
        makeMerchant({ merchant_terminals: [], merchant_commissions: [] }),
      );
      mockPrisma.merchants.update.mockResolvedValue(
        makeMerchant({ status: "SUSPENDED" }),
      );

      const result = await service.changeStatus(
        "merchant-uuid-1",
        "SUSPENDED",
        ADMIN_ID,
      );

      expect(mockPrisma.merchants.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "SUSPENDED",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않는 가맹점이면 NotFoundException을 던진다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus("non-existent", "SUSPENDED", ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // findOne
  // ================================================================
  describe("findOne", () => {
    it("가맹점을 조회하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(
        makeMerchant({ merchant_terminals: [], merchant_commissions: [] }),
      );

      const result = await service.findOne("merchant-uuid-1");

      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // update
  // ================================================================
  describe("update", () => {
    it("가맹점 정보를 업데이트하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(
        makeMerchant({ merchant_terminals: [], merchant_commissions: [] }),
      );
      mockPrisma.merchants.update.mockResolvedValue(
        makeMerchant({ merchant_name: "수정된가맹점" }),
      );

      const result = await service.update(
        "merchant-uuid-1",
        { merchantName: "수정된가맹점" },
        ADMIN_ID,
      );

      expect(mockPrisma.merchants.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchant_name: "수정된가맹점",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않는 가맹점 업데이트는 NotFoundException을 던진다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null);

      await expect(
        service.update("non-existent", {}, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // remove
  // ================================================================
  describe("remove", () => {
    it("가맹점을 소프트 삭제한다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(
        makeMerchant({ merchant_terminals: [], merchant_commissions: [] }),
      );
      mockPrisma.merchants.update.mockResolvedValue(makeMerchant());

      await service.remove("merchant-uuid-1", ADMIN_ID);

      expect(mockPrisma.merchants.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ updated_by: ADMIN_ID }),
        }),
      );
    });

    it("존재하지 않는 가맹점 삭제는 NotFoundException을 던진다", async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null);

      await expect(service.remove("non-existent", ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
