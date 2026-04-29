import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { AgentsService } from "../agents.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  agents: {
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
  merchants: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makeAgent = (overrides: Record<string, unknown> = {}) => ({
  id: "agent-uuid-1",
  agent_code: "AGENT001",
  agent_name: "테스트대리점",
  status: "ACTIVE",
  tree_path: "/agent-uuid-1",
  tree_depth: 0,
  parent_id: null,
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
  merchants: [],
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("AgentsService", () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 페이지네이션으로 목록을 반환한다", async () => {
      const agent = makeAgent();
      mockPrisma.$transaction.mockResolvedValue([[agent], 1]);

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
      const agent = makeAgent({ bank_account: "12345678901234" });
      mockPrisma.$transaction.mockResolvedValue([[agent], 1]);

      const result = await service.findAll({});

      expect(result.data[0].bank_account).toBe("****1234");
    });

    it("status 필터가 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ status: "SUSPENDED" });

      expect(mockPrisma.agents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "SUSPENDED" }),
        }),
      );
    });

    it("search 필터가 agent_name contains로 적용된다", async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ search: "테스트" });

      expect(mockPrisma.agents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agent_name: { contains: "테스트", mode: "insensitive" },
          }),
        }),
      );
    });

    it("bank_account가 null이면 null을 반환한다", async () => {
      const agent = makeAgent({ bank_account: null });
      mockPrisma.$transaction.mockResolvedValue([[agent], 1]);

      const result = await service.findAll({});

      expect(result.data[0].bank_account).toBeNull();
    });
  });

  // ================================================================
  // create
  // ================================================================
  describe("create", () => {
    const createDto = {
      agentName: "테스트대리점",
      businessNo: "123-45-67890",
    };

    it("루트 대리점을 자동 채번으로 생성한다 (tree_depth=0)", async () => {
      const agent = makeAgent();
      mockPrisma.agents.count.mockResolvedValue(0); // 당일 첫 번째
      mockPrisma.$transaction.mockResolvedValue([{}, agent]);

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

    it("하위 대리점을 생성하면 tree_path와 tree_depth가 계산된다", async () => {
      const parentAgent = makeAgent({
        id: "parent-uuid-1",
        tree_path: "/parent-uuid-1",
        tree_depth: 0,
        status: "ACTIVE",
      });
      mockPrisma.agents.count.mockResolvedValue(0);
      mockPrisma.agents.findFirst
        .mockResolvedValueOnce(parentAgent) // parent lookup
        .mockResolvedValue(makeAgent()); // findOne in other calls
      mockPrisma.$transaction.mockResolvedValue([{}, makeAgent()]);

      await service.create(
        { ...createDto, parentAgentId: "parent-uuid-1" },
        ADMIN_ID,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.companies.create).toHaveBeenCalled();
    });

    it("당일 기존 대리점이 있으면 순번이 증가한다", async () => {
      mockPrisma.agents.count.mockResolvedValue(3); // 당일 3개 존재
      mockPrisma.$transaction.mockResolvedValue([{}, makeAgent()]);

      await service.create(createDto, ADMIN_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("상위 대리점이 존재하지 않으면 NotFoundException을 던진다", async () => {
      mockPrisma.agents.count.mockResolvedValue(0);
      mockPrisma.agents.findFirst.mockResolvedValue(null); // parent not found

      await expect(
        service.create(
          { ...createDto, parentAgentId: "non-existent" },
          ADMIN_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("상위 대리점이 ACTIVE가 아니면 BadRequestException을 던진다", async () => {
      mockPrisma.agents.count.mockResolvedValue(0);
      mockPrisma.agents.findFirst.mockResolvedValue(
        makeAgent({ status: "SUSPENDED" }),
      );

      await expect(
        service.create(
          { ...createDto, parentAgentId: "parent-uuid-1" },
          ADMIN_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ================================================================
  // findOne
  // ================================================================
  describe("findOne", () => {
    it("대리점을 조회하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());

      const result = await service.findOne("agent-uuid-1");

      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // update
  // ================================================================
  describe("update", () => {
    it("대리점 정보를 업데이트하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());
      mockPrisma.agents.update.mockResolvedValue(
        makeAgent({ agent_name: "수정된대리점" }),
      );

      const result = await service.update(
        "agent-uuid-1",
        { agentName: "수정된대리점" },
        ADMIN_ID,
      );

      expect(mockPrisma.agents.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agent_name: "수정된대리점",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않는 대리점 업데이트는 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(
        service.update("non-existent", {}, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // getSubAgents
  // ================================================================
  describe("getSubAgents", () => {
    it("하위 대리점 목록을 bank_account 마스킹하여 반환한다", async () => {
      const parent = makeAgent();
      const sub = makeAgent({
        id: "sub-uuid-1",
        bank_account: "98765432109876",
      });
      mockPrisma.agents.findFirst.mockResolvedValue(parent); // findOne
      mockPrisma.agents.findMany.mockResolvedValue([sub]);

      const result = await service.getSubAgents("agent-uuid-1");

      expect(mockPrisma.agents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parent_id: "agent-uuid-1" }),
        }),
      );
      expect(result[0].bank_account).toBe("****9876");
    });

    it("존재하지 않는 대리점이면 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(service.getSubAgents("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ================================================================
  // changeStatus
  // ================================================================
  describe("changeStatus", () => {
    it("대리점 상태를 변경하고 bank_account를 마스킹하여 반환한다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());
      mockPrisma.agents.update.mockResolvedValue(
        makeAgent({ status: "SUSPENDED" }),
      );

      const result = await service.changeStatus(
        "agent-uuid-1",
        "SUSPENDED",
        ADMIN_ID,
      );

      expect(mockPrisma.agents.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "SUSPENDED",
            updated_by: ADMIN_ID,
          }),
        }),
      );
      expect(result.bank_account).toBe("****1234");
    });

    it("존재하지 않는 대리점이면 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus("non-existent", "SUSPENDED", ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // remove
  // ================================================================
  describe("remove", () => {
    it("대리점을 소프트 삭제한다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());
      mockPrisma.agents.count.mockResolvedValue(0); // no sub-agents
      mockPrisma.merchants.count.mockResolvedValue(0); // no merchants
      mockPrisma.agents.update.mockResolvedValue(makeAgent());

      await service.remove("agent-uuid-1", ADMIN_ID);

      expect(mockPrisma.agents.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ updated_by: ADMIN_ID }),
        }),
      );
    });

    it("하위 대리점이 있으면 BadRequestException(AGENT_004)을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());
      mockPrisma.agents.count.mockResolvedValue(1); // has sub-agents

      await expect(service.remove("agent-uuid-1", ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("연결된 가맹점이 있으면 BadRequestException(AGENT_005)을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(makeAgent());
      mockPrisma.agents.count.mockResolvedValue(0); // no sub-agents
      mockPrisma.merchants.count.mockResolvedValue(1); // has merchants

      await expect(service.remove("agent-uuid-1", ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("존재하지 않는 대리점 삭제는 NotFoundException을 던진다", async () => {
      mockPrisma.agents.findFirst.mockResolvedValue(null);

      await expect(service.remove("non-existent", ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
