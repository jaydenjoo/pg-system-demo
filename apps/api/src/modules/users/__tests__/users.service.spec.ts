import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { UsersService } from "../users.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SecurityService } from "../../security/security.service";

// ---- Mock Prisma ----
const mockPrisma = {
  users: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user_roles: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
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
const makeUser = (overrides = {}) => ({
  id: "user-uuid-1",
  login_id: "testuser",
  name: "테스트유저",
  email: "test@example.com",
  phone: "010-1234-5678",
  user_type: "ADMIN",
  org_id: null,
  status: "ACTIVE",
  last_login_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  user_roles: [],
  user_mfa: [],
  ...overrides,
});

const ADMIN_ID = "admin-uuid-1";

describe("UsersService", () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ================================================================
  // findAll
  // ================================================================
  describe("findAll", () => {
    it("기본 조회 — 사용자 목록과 meta 반환", async () => {
      const users = [makeUser()];
      mockPrisma.$transaction.mockResolvedValueOnce([users, 1]);

      const result = await service.findAll({});

      expect(result.data).toEqual(users);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it("userType 필터 — where에 user_type 조건 포함", async () => {
      mockPrisma.$transaction.mockResolvedValueOnce([[], 0]);

      await service.findAll({ userType: "ADMIN" });

      expect(mockPrisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_type: "ADMIN" }),
        }),
      );
    });

    it("search 필터 — login_id와 name 모두 검색", async () => {
      const users = [makeUser({ login_id: "admin01", name: "관리자" })];
      mockPrisma.$transaction.mockResolvedValueOnce([users, 1]);

      const result = await service.findAll({ search: "관리자" });

      expect(result.data).toHaveLength(1);
    });

    it("페이지네이션 — limit=5, page=2 적용", async () => {
      mockPrisma.$transaction.mockResolvedValueOnce([[], 10]);

      const result = await service.findAll({ page: 2, limit: 5 });

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  // ================================================================
  // findById
  // ================================================================
  describe("findById", () => {
    it("존재하는 사용자 — 사용자 정보 반환", async () => {
      const user = makeUser();
      mockPrisma.users.findFirst.mockResolvedValueOnce(user);

      const result = await service.findById("user-uuid-1");

      // user_mfa is stripped from the result; mfa_enabled is derived instead
      const { user_mfa: _mfa, ...expectedUser } = user;
      expect(result).toEqual({ ...expectedUser, mfa_enabled: false });
      expect(mockPrisma.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-uuid-1", deleted_at: null },
        }),
      );
    });

    it("존재하지 않는 사용자 — NotFoundException 발생", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(null);

      await expect(service.findById("no-such-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("soft-deleted 사용자 — NotFoundException 발생 (deleted_at 필터)", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(null);

      await expect(service.findById("deleted-uuid")).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "deleted-uuid", deleted_at: null },
        }),
      );
    });
  });

  // ================================================================
  // create
  // ================================================================
  describe("create", () => {
    const createDto = {
      loginId: "newuser",
      name: "신규유저",
      password: "Password123!",
      userType: "ADMIN" as const,
    };

    it("정상 생성 — 사용자 생성 후 반환", async () => {
      mockPrisma.users.findUnique.mockResolvedValueOnce(null);
      const created = makeUser({ login_id: "newuser", name: "신규유저" });
      mockPrisma.users.create.mockResolvedValueOnce(created);

      const result = await service.create(createDto, ADMIN_ID);

      expect(result).toEqual(created);
      expect(mockPrisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            login_id: "newuser",
            created_by: ADMIN_ID,
          }),
        }),
      );
    });

    it("중복 loginId — ConflictException 발생", async () => {
      mockPrisma.users.findUnique.mockResolvedValueOnce(makeUser());

      await expect(service.create(createDto, ADMIN_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("roleIds 포함 생성 — user_roles.createMany 호출", async () => {
      mockPrisma.users.findUnique.mockResolvedValueOnce(null);
      const created = makeUser({ id: "new-uuid" });
      mockPrisma.users.create.mockResolvedValueOnce(created);
      mockPrisma.user_roles.createMany.mockResolvedValueOnce({ count: 1 });

      await service.create(
        { ...createDto, roleIds: ["role-uuid-1"] },
        ADMIN_ID,
      );

      expect(mockPrisma.user_roles.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            {
              user_id: "new-uuid",
              role_id: "role-uuid-1",
              assigned_by: ADMIN_ID,
            },
          ],
        }),
      );
    });
  });

  // ================================================================
  // update
  // ================================================================
  describe("update", () => {
    it("상태 변경 — status 업데이트 및 updated_by 기록", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(makeUser());
      const updated = makeUser({ status: "LOCKED" });
      mockPrisma.users.update.mockResolvedValueOnce(updated);

      const result = await service.update(
        "user-uuid-1",
        { status: "LOCKED" },
        ADMIN_ID,
      );

      expect(result.status).toBe("LOCKED");
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "LOCKED",
            updated_by: ADMIN_ID,
          }),
        }),
      );
    });

    it("이름/이메일 변경 — name, email 업데이트", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(makeUser());
      const updated = makeUser({
        name: "변경된이름",
        email: "new@example.com",
      });
      mockPrisma.users.update.mockResolvedValueOnce(updated);

      const result = await service.update(
        "user-uuid-1",
        { name: "변경된이름", email: "new@example.com" },
        ADMIN_ID,
      );

      expect(result.name).toBe("변경된이름");
      expect(result.email).toBe("new@example.com");
    });
  });

  // ================================================================
  // remove
  // ================================================================
  describe("remove", () => {
    it("soft delete — deleted_at과 updated_by 기록", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(makeUser());
      mockPrisma.users.update.mockResolvedValueOnce({});

      await service.remove("user-uuid-1", ADMIN_ID);

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-uuid-1" },
          data: expect.objectContaining({
            deleted_at: expect.any(Date),
            updated_by: ADMIN_ID,
          }),
        }),
      );
    });
  });

  // ================================================================
  // assignRoles
  // ================================================================
  describe("assignRoles", () => {
    it("정상 할당 — 기존 역할 삭제 후 새 역할 할당", async () => {
      // findById (assignRoles 내부) + getUserRoles 내부 findById
      mockPrisma.users.findFirst
        .mockResolvedValueOnce(makeUser())
        .mockResolvedValueOnce(makeUser());
      mockPrisma.$transaction.mockResolvedValueOnce([]);
      const roles = [
        {
          assigned_at: new Date(),
          roles: {
            id: "role-1",
            name: "SUPER_ADMIN",
            description: null,
            user_type: "ADMIN",
          },
        },
      ];
      mockPrisma.user_roles.findMany.mockResolvedValueOnce(roles);

      const result = await service.assignRoles(
        "user-uuid-1",
        ["role-1"],
        ADMIN_ID,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.data).toEqual(roles);
    });

    it("존재하지 않는 사용자 — NotFoundException 발생", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignRoles("no-such-id", ["role-1"], ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================================================================
  // getUserRoles
  // ================================================================
  describe("getUserRoles", () => {
    it("역할 목록 반환 — data 배열 포함", async () => {
      mockPrisma.users.findFirst.mockResolvedValueOnce(makeUser());
      const roles = [
        {
          assigned_at: new Date(),
          roles: {
            id: "role-1",
            name: "SUPER_ADMIN",
            description: null,
            user_type: "ADMIN",
          },
        },
      ];
      mockPrisma.user_roles.findMany.mockResolvedValueOnce(roles);

      const result = await service.getUserRoles("user-uuid-1");

      expect(result.data).toEqual(roles);
      expect(mockPrisma.user_roles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: "user-uuid-1" } }),
      );
    });
  });
});
