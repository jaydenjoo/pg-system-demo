import { Test, TestingModule } from "@nestjs/testing";
import {
  AuditHashChainService,
  AuditLogInput,
} from "../audit-hash-chain.service";
import { PrismaService } from "../../../prisma/prisma.service";
import * as crypto from "crypto";

// ---- Mock Prisma ----
const mockPrisma = {
  audit_logs: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

// ---- Fixture helpers ----
const makeLogInput = (overrides: Partial<AuditLogInput> = {}): AuditLogInput => ({
  action: "CREATE",
  resourceType: "USER",
  resourceId: "user-uuid-1",
  detail: { field: "name" },
  ipAddress: "127.0.0.1",
  createdAt: new Date("2026-02-28T12:00:00.000Z"),
  ...overrides,
});

describe("AuditHashChainService", () => {
  let service: AuditHashChainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditHashChainService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditHashChainService>(AuditHashChainService);
    jest.clearAllMocks();
  });

  // ================================================================
  // computeLogHash
  // ================================================================
  describe("computeLogHash", () => {
    it("동일 입력에 동일 해시를 반환한다", () => {
      const input = makeLogInput();
      const hash1 = service.computeLogHash(input);
      const hash2 = service.computeLogHash(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64자
    });

    it("다른 입력에 다른 해시를 반환한다", () => {
      const input1 = makeLogInput({ action: "CREATE" });
      const input2 = makeLogInput({ action: "DELETE" });

      const hash1 = service.computeLogHash(input1);
      const hash2 = service.computeLogHash(input2);

      expect(hash1).not.toBe(hash2);
    });

    it("resourceId가 null이면 빈 문자열로 처리한다", () => {
      const withId = makeLogInput({ resourceId: "some-id" });
      const withNull = makeLogInput({ resourceId: null });

      const hash1 = service.computeLogHash(withId);
      const hash2 = service.computeLogHash(withNull);

      expect(hash1).not.toBe(hash2);
    });

    it("detail이 null이면 빈 문자열로 처리한다", () => {
      const withDetail = makeLogInput({ detail: { key: "value" } });
      const withNull = makeLogInput({ detail: null });

      const hash1 = service.computeLogHash(withDetail);
      const hash2 = service.computeLogHash(withNull);

      expect(hash1).not.toBe(hash2);
    });
  });

  // ================================================================
  // computeChainHash
  // ================================================================
  describe("computeChainHash", () => {
    it("prevHash가 null이면 GENESIS를 사용한다", () => {
      const logHash = "abc123";
      const chainHash = service.computeChainHash(logHash, null);
      const expected = crypto
        .createHash("sha256")
        .update(logHash + "GENESIS")
        .digest("hex");

      expect(chainHash).toBe(expected);
    });

    it("prevHash가 있으면 연결하여 해시한다", () => {
      const logHash = "abc123";
      const prevHash = "prev456";
      const chainHash = service.computeChainHash(logHash, prevHash);
      const expected = crypto
        .createHash("sha256")
        .update(logHash + prevHash)
        .digest("hex");

      expect(chainHash).toBe(expected);
    });
  });

  // ================================================================
  // getLatestHash
  // ================================================================
  describe("getLatestHash", () => {
    it("로그가 있으면 최신 log_hash를 반환한다", async () => {
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce({
        log_hash: "latest-hash-value",
      });

      const result = await service.getLatestHash();
      expect(result).toBe("latest-hash-value");
    });

    it("로그가 없으면 null을 반환한다", async () => {
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce(null);

      const result = await service.getLatestHash();
      expect(result).toBeNull();
    });
  });

  // ================================================================
  // verifyChain
  // ================================================================
  describe("verifyChain", () => {
    const startDate = new Date("2026-02-01");
    const endDate = new Date("2026-02-28");

    it("로그가 없으면 valid: true, totalLogs: 0을 반환한다", async () => {
      mockPrisma.audit_logs.findMany.mockResolvedValueOnce([]);

      const result = await service.verifyChain(startDate, endDate);

      expect(result).toEqual({ valid: true, totalLogs: 0 });
    });

    it("정상 체인이면 valid: true를 반환한다", async () => {
      // 체인 구성: log1 → log2
      const log1Input = makeLogInput({ action: "CREATE" });
      const log1ContentHash = service.computeLogHash(log1Input);
      const log1ChainHash = service.computeChainHash(log1ContentHash, null);

      const log2Input = makeLogInput({
        action: "UPDATE",
        createdAt: new Date("2026-02-28T13:00:00.000Z"),
      });
      const log2ContentHash = service.computeLogHash(log2Input);
      const log2ChainHash = service.computeChainHash(
        log2ContentHash,
        log1ChainHash,
      );

      mockPrisma.audit_logs.findMany.mockResolvedValueOnce([
        {
          id: "log-1",
          action: log1Input.action,
          resource_type: log1Input.resourceType,
          resource_id: log1Input.resourceId,
          detail: log1Input.detail,
          ip_address: log1Input.ipAddress,
          created_at: log1Input.createdAt,
          log_hash: log1ChainHash,
          prev_hash: null,
        },
        {
          id: "log-2",
          action: log2Input.action,
          resource_type: log2Input.resourceType,
          resource_id: log2Input.resourceId,
          detail: log2Input.detail,
          ip_address: log2Input.ipAddress,
          created_at: log2Input.createdAt,
          log_hash: log2ChainHash,
          prev_hash: log1ChainHash,
        },
      ]);

      // 시작 이전 로그 없음
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce(null);

      const result = await service.verifyChain(startDate, endDate);

      expect(result).toEqual({ valid: true, totalLogs: 2 });
    });

    it("변조된 로그 발견 시 valid: false + brokenAt을 반환한다", async () => {
      const log1Input = makeLogInput({ action: "CREATE" });
      const log1ContentHash = service.computeLogHash(log1Input);
      const log1ChainHash = service.computeChainHash(log1ContentHash, null);

      mockPrisma.audit_logs.findMany.mockResolvedValueOnce([
        {
          id: "log-1",
          action: log1Input.action,
          resource_type: log1Input.resourceType,
          resource_id: log1Input.resourceId,
          detail: log1Input.detail,
          ip_address: log1Input.ipAddress,
          created_at: log1Input.createdAt,
          log_hash: log1ChainHash,
          prev_hash: null,
        },
        {
          id: "log-2",
          action: "TAMPERED_ACTION", // 변조됨
          resource_type: "USER",
          resource_id: "user-uuid-1",
          detail: { field: "name" },
          ip_address: "127.0.0.1",
          created_at: new Date("2026-02-28T13:00:00.000Z"),
          log_hash: "fake-hash-value",
          prev_hash: log1ChainHash,
        },
      ]);

      // 시작 이전 로그 없음
      mockPrisma.audit_logs.findFirst.mockResolvedValueOnce(null);

      const result = await service.verifyChain(startDate, endDate);

      expect(result.valid).toBe(false);
      expect(result.totalLogs).toBe(2);
      expect(result.brokenAt).toBe("log-2");
    });
  });
});
