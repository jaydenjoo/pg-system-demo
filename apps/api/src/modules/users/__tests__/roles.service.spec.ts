import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { RolesService } from "../roles.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  roles: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permissions: {
    findMany: jest.fn(),
  },
  role_permissions: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  user_roles: {
    count: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn(),
};

const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ---- Fixture helpers ----
const makeRole = (overrides = {}) => ({
  id: "role-uuid-1",
  name: "SUPER_ADMIN",
  description: "슈퍼 관리자",
  user_type: "ADMIN",
  created_at: new Date(),
  updated_at: new Date(),
  role_permissions: [],
  ...overrides,
});

const makePermission = (overrides = {}) => ({
  id: "perm-uuid-1",
  code: "user:read",
  name: "사용자 조회",
  resource: "user",
  action: "read",
  ...overrides,
});

describe("RolesService", () => {
  let service: RolesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAllRoles
  // ================================================================
  describe("findAllRoles", () => {
    it("역할 목록을 { data } 형태로 반환한다", async () => {
      const roles = [
        makeRole(),
        makeRole({ id: "role-uuid-2", name: "READ_ONLY_ADMIN" }),
      ];
      mockPrisma.roles.findMany.mockResolvedValueOnce(roles);

      const result = await service.findAllRoles();

      expect(result.data).toEqual(roles);
      expect(mockPrisma.roles.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // findRoleById
  // ================================================================
  describe("findRoleById", () => {
    it("존재하는 역할을 반환한다", async () => {
      const role = makeRole();
      mockPrisma.roles.findUnique.mockResolvedValueOnce(role);

      const result = await service.findRoleById("role-uuid-1");

      expect(result).toEqual(role);
      expect(mockPrisma.roles.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "role-uuid-1" } }),
      );
    });

    it("존재하지 않는 역할이면 NotFoundException을 던진다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(null);

      await expect(service.findRoleById("nonexistent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("NotFoundException에 ROLE_001 코드가 포함된다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.findRoleById("nonexistent-id"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROLE_001" }),
      });
    });
  });

  // ================================================================
  // createRole
  // ================================================================
  describe("createRole", () => {
    it("정상적으로 역할을 생성한다", async () => {
      const newRole = makeRole({ name: "NEW_ROLE" });
      mockPrisma.roles.findUnique.mockResolvedValueOnce(null); // 중복 없음
      mockPrisma.roles.create.mockResolvedValueOnce(newRole);

      const result = await service.createRole(
        { name: "NEW_ROLE", userType: "ADMIN" },
        "user-uuid-1",
      );

      expect(result).toEqual(newRole);
      expect(mockPrisma.roles.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.role_permissions.createMany).not.toHaveBeenCalled();
    });

    it("permissionIds가 있으면 role_permissions도 생성한다", async () => {
      const newRole = makeRole();
      mockPrisma.roles.findUnique.mockResolvedValueOnce(null);
      mockPrisma.roles.create.mockResolvedValueOnce(newRole);

      await service.createRole(
        {
          name: "NEW_ROLE",
          userType: "ADMIN",
          permissionIds: ["perm-uuid-1", "perm-uuid-2"],
        },
        "user-uuid-1",
      );

      expect(mockPrisma.role_permissions.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { role_id: newRole.id, permission_id: "perm-uuid-1" },
            { role_id: newRole.id, permission_id: "perm-uuid-2" },
          ],
        }),
      );
    });

    it("중복된 역할 이름이면 ConflictException을 던진다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(makeRole()); // 중복 존재

      await expect(
        service.createRole(
          { name: "SUPER_ADMIN", userType: "ADMIN" },
          "user-uuid-1",
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("ConflictException에 ROLE_002 코드가 포함된다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(makeRole());

      await expect(
        service.createRole(
          { name: "SUPER_ADMIN", userType: "ADMIN" },
          "user-uuid-1",
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROLE_002" }),
      });
    });
  });

  // ================================================================
  // updateRole
  // ================================================================
  describe("updateRole", () => {
    it("역할 이름과 설명을 수정한다", async () => {
      const existing = makeRole();
      const updated = makeRole({
        name: "UPDATED_ROLE",
        description: "새 설명",
      });
      mockPrisma.roles.findUnique.mockResolvedValueOnce(existing);
      mockPrisma.roles.update.mockResolvedValueOnce(updated);

      const result = await service.updateRole(
        "role-uuid-1",
        { name: "UPDATED_ROLE", description: "새 설명" },
        "user-uuid-1",
      );

      expect(result).toEqual(updated);
      expect(mockPrisma.roles.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "role-uuid-1" } }),
      );
    });
  });

  // ================================================================
  // deleteRole
  // ================================================================
  describe("deleteRole", () => {
    it("사용자에게 할당된 역할은 삭제할 수 없다 — ConflictException", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(makeRole());
      mockPrisma.user_roles.count.mockResolvedValueOnce(3); // 사용 중

      await expect(
        service.deleteRole("role-uuid-1", "user-uuid-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("ConflictException에 ROLE_003 코드가 포함된다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(makeRole());
      mockPrisma.user_roles.count.mockResolvedValueOnce(1);

      await expect(
        service.deleteRole("role-uuid-1", "user-uuid-1"),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROLE_003" }),
      });
    });

    it("사용 중이지 않은 역할은 $transaction으로 삭제한다", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(makeRole());
      mockPrisma.user_roles.count.mockResolvedValueOnce(0); // 미사용
      mockPrisma.$transaction.mockResolvedValueOnce([undefined, undefined]);

      await service.deleteRole("role-uuid-1", "user-uuid-1");

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // assignPermissions
  // ================================================================
  describe("assignPermissions", () => {
    it("역할에 권한을 재설정한다", async () => {
      const role = makeRole();
      mockPrisma.roles.findUnique
        .mockResolvedValueOnce(role) // findRoleById (존재 확인)
        .mockResolvedValueOnce(role); // findRoleById (반환용)
      mockPrisma.$transaction.mockResolvedValueOnce([undefined, undefined]);

      const result = await service.assignPermissions(
        "role-uuid-1",
        ["perm-uuid-1", "perm-uuid-2"],
        "user-uuid-1",
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual(role);
    });

    it("존재하지 않는 역할에 권한 할당 시 NotFoundException", async () => {
      mockPrisma.roles.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.assignPermissions(
          "nonexistent-id",
          ["perm-uuid-1"],
          "user-uuid-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // getAllPermissions
  // ================================================================
  describe("getAllPermissions", () => {
    it("전체 권한 목록을 { data } 형태로 반환한다", async () => {
      const permissions = [
        makePermission(),
        makePermission({
          id: "perm-uuid-2",
          code: "user:create",
          action: "create",
        }),
      ];
      mockPrisma.permissions.findMany.mockResolvedValueOnce(permissions);

      const result = await service.getAllPermissions();

      expect(result.data).toEqual(permissions);
      expect(mockPrisma.permissions.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
