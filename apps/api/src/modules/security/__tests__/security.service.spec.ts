import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { SecurityService } from "../security.service";
import { AuditHashChainService } from "../audit-hash-chain.service";
import { PrismaService } from "../../../prisma/prisma.service";

// ---- Mock Prisma ----
const mockPrismaModels = {
  audit_logs: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  login_history: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  risk_alerts: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockPrisma = {
  ...mockPrismaModels,
  $transaction: jest.fn(),
};

const mockAuditHashChain = {
  computeLogHash: jest.fn().mockReturnValue("abc123hash"),
  computeChainHash: jest.fn().mockReturnValue("chain456hash"),
  getLatestHash: jest.fn().mockResolvedValue(null),
};

// ---- Fixture helpers ----
const makeAuditLog = (overrides = {}) => ({
  id: "log-uuid-1",
  user_id: "user-uuid-1",
  action: "CREATE",
  resource_type: "USER",
  resource_id: null,
  detail: null,
  ip_address: "127.0.0.1",
  user_agent: null,
  created_at: new Date(),
  ...overrides,
});

const makeLoginHistory = (overrides = {}) => ({
  id: "lh-uuid-1",
  user_id: "user-uuid-1",
  login_result: "SUCCESS",
  ip_address: "127.0.0.1",
  user_agent: null,
  mfa_type: null,
  created_at: new Date(),
  ...overrides,
});

const makeRiskAlert = (overrides = {}) => ({
  id: "alert-uuid-1",
  alert_type: "SUSPICIOUS_LOGIN",
  severity: "HIGH",
  merchant_id: null,
  transaction_id: null,
  description: "의심스러운 로그인 감지",
  status: "OPEN",
  resolved_by: null,
  resolved_at: null,
  resolution_note: null,
  created_at: new Date(),
  ...overrides,
});

describe("SecurityService", () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditHashChainService, useValue: mockAuditHashChain },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);

    jest.clearAllMocks();
    // Restore $transaction after clearAllMocks — handle both patterns:
    // 1) Array of promises (getAuditLogs etc.)
    // 2) Callback function (writeAuditLog)
    mockPrisma.$transaction.mockImplementation(
      (
        input:
          | Promise<unknown>[]
          | ((tx: typeof mockPrisma) => Promise<unknown>),
      ) => (Array.isArray(input) ? Promise.all(input) : input(mockPrisma)),
    );
  });

  // ================================================================
  // getAuditLogs
  // ================================================================
  describe("getAuditLogs", () => {
    it("기본 조회 시 페이지네이션 메타와 함께 반환한다", async () => {
      const logs = [makeAuditLog()];
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce(logs);
      mockPrisma.audit_logs.count.mockResolvedValueOnce(1);

      const result = await service.getAuditLogs({});

      expect(result.data).toEqual(logs);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it("action 필터로 감사 로그를 조회한다", async () => {
      const logs = [makeAuditLog({ action: "DELETE" })];
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce(logs);
      mockPrisma.audit_logs.count.mockResolvedValueOnce(1);

      await service.getAuditLogs({ action: "DELETE" });

      expect(mockPrisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: "DELETE" }),
        }),
      );
    });

    it("resourceType 필터로 감사 로그를 조회한다", async () => {
      const logs = [makeAuditLog({ resource_type: "MERCHANT" })];
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce(logs);
      mockPrisma.audit_logs.count.mockResolvedValueOnce(1);

      await service.getAuditLogs({ resourceType: "MERCHANT" });

      expect(mockPrisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resource_type: "MERCHANT" }),
        }),
      );
    });

    it("날짜 범위 필터로 감사 로그를 조회한다", async () => {
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce([]);
      mockPrisma.audit_logs.count.mockResolvedValueOnce(0);

      await service.getAuditLogs({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });

      expect(mockPrisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date("2026-01-01"),
              lte: new Date("2026-01-31"),
            },
          }),
        }),
      );
    });

    it("userId 필터로 감사 로그를 조회한다", async () => {
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce([]);
      mockPrisma.audit_logs.count.mockResolvedValueOnce(0);

      await service.getAuditLogs({ userId: "user-uuid-1" });

      expect(mockPrisma.audit_logs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: "user-uuid-1" }),
        }),
      );
    });
  });

  // ================================================================
  // getRiskAlerts
  // ================================================================
  describe("getRiskAlerts", () => {
    it("severity 필터로 리스크 알림을 조회한다", async () => {
      const alerts = [makeRiskAlert({ severity: "HIGH" })];
      mockPrisma.risk_alerts.findMany.mockResolvedValueOnce(alerts);
      mockPrisma.risk_alerts.count.mockResolvedValueOnce(1);

      await service.getRiskAlerts({ severity: "HIGH" });

      expect(mockPrisma.risk_alerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: "HIGH" }),
        }),
      );
    });

    it("resolved=true 필터로 해결된 알림을 조회한다", async () => {
      const alerts = [makeRiskAlert({ status: "RESOLVED" })];
      mockPrisma.risk_alerts.findMany.mockResolvedValueOnce(alerts);
      mockPrisma.risk_alerts.count.mockResolvedValueOnce(1);

      await service.getRiskAlerts({ resolved: true });

      expect(mockPrisma.risk_alerts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "RESOLVED" }),
        }),
      );
    });
  });

  // ================================================================
  // resolveRiskAlert
  // ================================================================
  describe("resolveRiskAlert", () => {
    it("리스크 알림을 정상 해결 처리한다", async () => {
      const alert = makeRiskAlert();
      const resolved = makeRiskAlert({
        status: "RESOLVED",
        resolved_at: new Date(),
      });
      mockPrisma.risk_alerts.findUnique.mockResolvedValueOnce(alert);
      mockPrisma.risk_alerts.update.mockResolvedValueOnce(resolved);

      const result = await service.resolveRiskAlert(
        "alert-uuid-1",
        "user-uuid-1",
      );

      expect(result.status).toBe("RESOLVED");
      expect(mockPrisma.risk_alerts.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "alert-uuid-1" } }),
      );
    });

    it("존재하지 않는 알림 해결 시 NotFoundException을 던진다", async () => {
      mockPrisma.risk_alerts.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resolveRiskAlert("nonexistent-id", "user-uuid-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // getLoginHistory
  // ================================================================
  describe("getLoginHistory", () => {
    it("result 필터로 로그인 이력을 조회한다", async () => {
      const history = [makeLoginHistory({ login_result: "FAILED" })];
      mockPrisma.login_history.findMany.mockResolvedValueOnce(history);
      mockPrisma.login_history.count.mockResolvedValueOnce(1);

      await service.getLoginHistory({ result: "FAILED" });

      expect(mockPrisma.login_history.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ login_result: "FAILED" }),
        }),
      );
    });

    it("날짜 범위 필터로 로그인 이력을 조회한다", async () => {
      mockPrisma.login_history.findMany.mockResolvedValueOnce([]);
      mockPrisma.login_history.count.mockResolvedValueOnce(0);

      await service.getLoginHistory({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });

      expect(mockPrisma.login_history.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date("2026-01-01"),
              lte: new Date("2026-01-31"),
            },
          }),
        }),
      );
    });

    it("페이지네이션 메타를 올바르게 계산한다", async () => {
      mockPrisma.login_history.findMany.mockResolvedValueOnce([]);
      mockPrisma.login_history.count.mockResolvedValueOnce(45);

      const result = await service.getLoginHistory({ page: 2, limit: 20 });

      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });

  // ================================================================
  // writeAuditLog
  // ================================================================
  describe("writeAuditLog", () => {
    it("감사 로그를 DB에 기록한다", async () => {
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce(null);
      mockPrisma.audit_logs.create.mockResolvedValueOnce(makeAuditLog());

      await service.writeAuditLog({
        userId: "user-uuid-1",
        action: "CREATE",
        resourceType: "USER",
        resourceId: "resource-uuid-1",
        ipAddress: "127.0.0.1",
      });

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: "user-uuid-1",
            action: "CREATE",
            resource_type: "USER",
          }),
        }),
      );
    });

    it("userId 없이도 감사 로그를 기록한다", async () => {
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce(null);
      mockPrisma.audit_logs.create.mockResolvedValueOnce(
        makeAuditLog({ user_id: null }),
      );

      await service.writeAuditLog({
        action: "READ",
        resourceType: "SYSTEM",
      });

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledTimes(1);
    });
  });
});
