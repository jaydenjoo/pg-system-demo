import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { SystemService } from "../system.service";
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
  system_codes: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  holidays: {
    findMany: jest.fn(),
  },
  menus: {
    findMany: jest.fn(),
  },
  notifications: {
    findMany: jest.fn(),
  },
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makeCode = (overrides = {}) => ({
  id: "code-uuid-1",
  group_code: "BANK",
  code: "SHINHAN",
  name: "신한은행",
  sort_order: 1,
  extra_value1: null,
  extra_value2: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe("SystemService", () => {
  let service: SystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<SystemService>(SystemService);
    jest.clearAllMocks();
  });

  // ================================================================
  // getSystemCodes
  // ================================================================
  describe("getSystemCodes", () => {
    it("활성화된 전체 코드 목록을 반환한다", async () => {
      const codes = [makeCode(), makeCode({ id: "code-uuid-2", code: "KB" })];
      mockPrisma.system_codes.findMany.mockResolvedValueOnce(codes);

      const result = await service.getSystemCodes();

      expect(result).toEqual(codes);
      expect(mockPrisma.system_codes.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_active: true },
        }),
      );
    });
  });

  // ================================================================
  // getCodesByGroup
  // ================================================================
  describe("getCodesByGroup", () => {
    it("그룹 코드별 활성화 코드를 반환한다", async () => {
      const codes = [makeCode()];
      mockPrisma.system_codes.findMany.mockResolvedValueOnce(codes);

      const result = await service.getCodesByGroup("BANK");

      expect(result).toEqual(codes);
      expect(mockPrisma.system_codes.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { group_code: "BANK", is_active: true },
        }),
      );
    });
  });

  // ================================================================
  // createCode
  // ================================================================
  describe("createCode", () => {
    it("정상적으로 시스템 코드를 생성한다", async () => {
      const newCode = makeCode({ id: "code-uuid-new" });
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(null);
      mockPrisma.system_codes.create.mockResolvedValueOnce(newCode);

      const result = await service.createCode(
        { groupCode: "BANK", code: "WOORI", name: "우리은행" },
        "user-uuid-1",
      );

      expect(result).toEqual(newCode);
      expect(mockPrisma.system_codes.create).toHaveBeenCalledTimes(1);
    });

    it("중복된 group_code+code면 ConflictException을 던진다", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(makeCode());

      await expect(
        service.createCode(
          { groupCode: "BANK", code: "SHINHAN", name: "신한" },
          "user-uuid-1",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("ConflictException에 SYS_002 코드가 포함된다", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(makeCode());

      await expect(
        service.createCode(
          { groupCode: "BANK", code: "SHINHAN", name: "신한" },
          "user-uuid-1",
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SYS_002" }),
      });
    });
  });

  // ================================================================
  // updateCode
  // ================================================================
  describe("updateCode", () => {
    it("시스템 코드를 수정한다", async () => {
      const existing = makeCode();
      const updated = makeCode({ name: "수정된 이름" });
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(existing);
      mockPrisma.system_codes.update.mockResolvedValueOnce(updated);

      const result = await service.updateCode(
        "code-uuid-1",
        { name: "수정된 이름" },
        "user-uuid-1",
      );

      expect(result).toEqual(updated);
      expect(mockPrisma.system_codes.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "code-uuid-1" } }),
      );
    });

    it("존재하지 않는 코드 수정 시 NotFoundException", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateCode("nonexistent-id", { name: "test" }, "user-uuid-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("NotFoundException에 SYS_001 코드가 포함된다", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateCode("nonexistent-id", { name: "test" }, "user-uuid-1"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SYS_001" }),
      });
    });
  });

  // ================================================================
  // deleteCode
  // ================================================================
  describe("deleteCode", () => {
    it("시스템 코드를 비활성화(soft delete)한다", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(makeCode());
      mockPrisma.system_codes.update.mockResolvedValueOnce(undefined);

      await service.deleteCode("code-uuid-1", "user-uuid-1");

      expect(mockPrisma.system_codes.update).toHaveBeenCalledWith({
        where: { id: "code-uuid-1" },
        data: { is_active: false },
      });
    });

    it("존재하지 않는 코드 삭제 시 NotFoundException", async () => {
      mockPrisma.system_codes.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.deleteCode("nonexistent-id", "user-uuid-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
