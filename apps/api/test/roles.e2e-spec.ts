import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface SuccessResponse<T> {
  success: boolean;
  data: T;
}

interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  user_type: string;
  created_at: string;
}

interface RoleDetail extends RoleSummary {
  updated_at: string;
  role_permissions: Array<{
    permissions: {
      id: string;
      code: string;
      name: string;
      resource: string;
      action: string;
    };
  }>;
}

interface PermissionItem {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
}

describe("Roles & Permissions API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;
    prisma = getTestPrisma(app);
    await resetAdminUser(prisma);
    adminToken = await loginAsAdmin(server);
  });

  afterAll(async () => {
    // 테스트 생성된 역할 정리
    const testRoles = await prisma.roles.findMany({
      where: { name: { startsWith: "E2E_TEST_" } },
    });
    for (const r of testRoles) {
      await prisma.role_permissions.deleteMany({ where: { role_id: r.id } });
      await prisma.user_roles.deleteMany({ where: { role_id: r.id } });
    }
    await prisma.roles.deleteMany({
      where: { name: { startsWith: "E2E_TEST_" } },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. GET /api/v1/roles — 역할 목록 조회
  // ============================================================

  describe("GET /api/v1/roles", () => {
    it("역할 목록 조회 → 200 + 시드 역할 포함", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/roles",
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<RoleSummary[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // 시드에서 8개 역할이 생성됨
      expect(body.data.length).toBeGreaterThanOrEqual(8);

      const names = body.data.map((r) => r.name);
      expect(names).toContain("SUPER_ADMIN");
      expect(names).toContain("MERCHANT_OWNER");
    });

    it("토큰 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/roles").expect(401);
    });
  });

  // ============================================================
  // 2. POST /api/v1/roles — 역할 생성
  // ============================================================

  describe("POST /api/v1/roles", () => {
    it("유효한 데이터로 역할 생성 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/roles",
        adminToken,
      )
        .send({
          name: "E2E_TEST_ROLE_1",
          description: "E2E 테스트 역할",
          userType: "ADMIN",
        })
        .expect(201);

      const body = res.body as SuccessResponse<RoleDetail>;
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("E2E_TEST_ROLE_1");
      expect(body.data.user_type).toBe("ADMIN");
    });

    it("중복 역할 이름 → 409", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/roles",
        adminToken,
      )
        .send({
          name: "E2E_TEST_ROLE_1",
          description: "중복",
          userType: "ADMIN",
        })
        .expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ROLE_002");
    });

    it("필수 필드 누락 (name) → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/roles", adminToken)
        .send({ description: "이름없음", userType: "ADMIN" })
        .expect(400);
    });

    it("이름 2자 미만 → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/roles", adminToken)
        .send({ name: "A", userType: "ADMIN" })
        .expect(400);
    });
  });

  // ============================================================
  // 3. GET /api/v1/roles/:id — 역할 상세 조회
  // ============================================================

  describe("GET /api/v1/roles/:id", () => {
    it("존재하는 역할 조회 → 200 + 권한 목록 포함", async () => {
      const role = await prisma.roles.findUniqueOrThrow({
        where: { name: "SUPER_ADMIN" },
      });

      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/roles/${role.id}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<RoleDetail>;
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("SUPER_ADMIN");
      expect(body.data.role_permissions.length).toBeGreaterThan(0);
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/roles/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });
  });

  // ============================================================
  // 4. PUT /api/v1/roles/:id — 역할 수정
  // ============================================================

  describe("PUT /api/v1/roles/:id", () => {
    it("역할 설명 수정 → 200", async () => {
      const role = await prisma.roles.findUniqueOrThrow({
        where: { name: "E2E_TEST_ROLE_1" },
      });

      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/roles/${role.id}`,
        adminToken,
      )
        .send({ description: "수정된 설명" })
        .expect(200);

      const body = res.body as SuccessResponse<RoleSummary>;
      expect(body.success).toBe(true);
      expect(body.data.description).toBe("수정된 설명");
    });
  });

  // ============================================================
  // 5. PUT /api/v1/roles/:id/permissions — 역할에 권한 할당
  // ============================================================

  describe("PUT /api/v1/roles/:id/permissions", () => {
    it("역할에 권한 할당 → 200", async () => {
      const role = await prisma.roles.findUniqueOrThrow({
        where: { name: "E2E_TEST_ROLE_1" },
      });

      // 권한 2개 조회
      const perms = await prisma.permissions.findMany({ take: 2 });
      const permIds = perms.map((p) => p.id);

      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/roles/${role.id}/permissions`,
        adminToken,
      )
        .send({ permissionIds: permIds })
        .expect(200);

      const body = res.body as SuccessResponse<RoleDetail>;
      expect(body.success).toBe(true);
      expect(body.data.role_permissions.length).toBe(2);
    });
  });

  // ============================================================
  // 6. DELETE /api/v1/roles/:id — 역할 삭제
  // ============================================================

  describe("DELETE /api/v1/roles/:id", () => {
    let deleteRoleId: string;

    beforeAll(async () => {
      // 삭제 대상 역할 생성
      const role = await prisma.roles.create({
        data: {
          name: "E2E_TEST_DELETE_TARGET",
          description: "삭제 대상",
          user_type: "ADMIN",
        },
      });
      deleteRoleId = role.id;
    });

    it("사용자에게 할당되지 않은 역할 삭제 → 204", async () => {
      await authenticatedRequest(
        server,
        "delete",
        `/api/v1/roles/${deleteRoleId}`,
        adminToken,
      ).expect(204);
    });

    it("사용자에게 할당된 역할 삭제 시도 → 409", async () => {
      // SUPER_ADMIN 역할은 admin 사용자에 할당됨
      const role = await prisma.roles.findUniqueOrThrow({
        where: { name: "SUPER_ADMIN" },
      });

      const res = await authenticatedRequest(
        server,
        "delete",
        `/api/v1/roles/${role.id}`,
        adminToken,
      ).expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ROLE_003");
    });
  });

  // ============================================================
  // 7. GET /api/v1/permissions — 전체 권한 목록
  // ============================================================

  describe("GET /api/v1/permissions", () => {
    it("권한 목록 조회 → 200 + 28개 이상", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/permissions",
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<PermissionItem[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(28);

      // 구조 확인
      const first = body.data[0];
      expect(first.code).toBeDefined();
      expect(first.resource).toBeDefined();
      expect(first.action).toBeDefined();
    });
  });
});
