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

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface UserSummary {
  id: string;
  login_id: string;
  name: string;
  email: string | null;
  user_type: string;
  status: string;
}

interface UserDetail extends UserSummary {
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  user_roles: Array<{
    assigned_at: string;
    roles: { id: string; name: string; user_type: string };
  }>;
}

describe("Users API (e2e)", () => {
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
    // 테스트 생성된 사용자 정리
    const testUsers = await prisma.users.findMany({
      where: { login_id: { startsWith: "e2e_test_" } },
    });
    for (const u of testUsers) {
      await prisma.user_roles.deleteMany({ where: { user_id: u.id } });
      await prisma.refresh_tokens.deleteMany({ where: { user_id: u.id } });
      await prisma.login_history.deleteMany({ where: { user_id: u.id } });
    }
    await prisma.users.deleteMany({
      where: { login_id: { startsWith: "e2e_test_" } },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. GET /api/v1/users/me — 내 정보 조회
  // ============================================================

  describe("GET /api/v1/users/me", () => {
    it("유효한 토큰으로 내 정보 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/users/me",
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<
        UserDetail & { permissions: string[] }
      >;
      expect(body.success).toBe(true);
      expect(body.data.login_id).toBe("admin");
      expect(body.data.permissions).toEqual(
        expect.arrayContaining(["user:read"]),
      );
    });

    it("토큰 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/users/me").expect(401);
    });
  });

  // ============================================================
  // 2. GET /api/v1/users — 사용자 목록 (페이지네이션)
  // ============================================================

  describe("GET /api/v1/users", () => {
    it("사용자 목록 조회 → 200 + 페이지네이션 메타", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/users",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<UserSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBeGreaterThan(0);
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/users").expect(401);
    });

    it("page, limit 파라미터 적용", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/users?page=1&limit=5",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<UserSummary>;
      expect(body.meta.limit).toBe(5);
    });
  });

  // ============================================================
  // 3. POST /api/v1/users — 사용자 생성
  // ============================================================

  describe("POST /api/v1/users", () => {
    it("유효한 데이터로 사용자 생성 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/users",
        adminToken,
      )
        .send({
          loginId: "e2e_test_user1",
          name: "테스트 사용자1",
          password: "TestPassword1!@#",
          userType: "ADMIN",
          email: "e2e_test1@test.com",
        })
        .expect(201);

      const body = res.body as SuccessResponse<UserSummary>;
      expect(body.success).toBe(true);
      expect(body.data.login_id).toBe("e2e_test_user1");
      expect(body.data.name).toBe("테스트 사용자1");
      expect(body.data.user_type).toBe("ADMIN");
    });

    it("중복 loginId → 409", async () => {
      // e2e_test_user1은 위 테스트에서 이미 생성됨
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/users",
        adminToken,
      )
        .send({
          loginId: "e2e_test_user1",
          name: "중복 테스트",
          password: "TestPassword1!@#",
          userType: "ADMIN",
        })
        .expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });

    it("비밀번호 12자 미만 → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/users", adminToken)
        .send({
          loginId: "e2e_test_short_pw",
          name: "짧은비번",
          password: "Short1!",
          userType: "ADMIN",
        })
        .expect(400);
    });

    it("필수 필드 누락 (loginId) → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/users", adminToken)
        .send({
          name: "이름만",
          password: "TestPassword1!@#",
          userType: "ADMIN",
        })
        .expect(400);
    });
  });

  // ============================================================
  // 4. GET /api/v1/users/:id — 사용자 상세 조회
  // ============================================================

  describe("GET /api/v1/users/:id", () => {
    it("존재하는 사용자 조회 → 200 + password_hash 미포함", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "admin" },
      });

      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/users/${user.id}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<UserDetail>;
      expect(body.success).toBe(true);
      expect(body.data.login_id).toBe("admin");
      // 보안: password_hash가 응답에 포함되지 않아야 함
      expect(
        (body.data as unknown as Record<string, unknown>).password_hash,
      ).toBeUndefined();
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/users/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });

    it("잘못된 UUID 형식 → 400", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/users/not-a-uuid",
        adminToken,
      ).expect(400);
    });
  });

  // ============================================================
  // 5. PUT /api/v1/users/:id — 사용자 수정
  // ============================================================

  describe("PUT /api/v1/users/:id", () => {
    it("이름과 이메일 수정 → 200", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "e2e_test_user1" },
      });

      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/users/${user.id}`,
        adminToken,
      )
        .send({ name: "수정된이름", email: "updated@test.com" })
        .expect(200);

      const body = res.body as SuccessResponse<UserSummary>;
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("수정된이름");
    });

    it("유효하지 않은 이메일 → 400", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "e2e_test_user1" },
      });

      await authenticatedRequest(
        server,
        "put",
        `/api/v1/users/${user.id}`,
        adminToken,
      )
        .send({ email: "not-an-email" })
        .expect(400);
    });
  });

  // ============================================================
  // 6. DELETE /api/v1/users/:id — 사용자 비활성화
  // ============================================================

  describe("DELETE /api/v1/users/:id", () => {
    let deleteTargetId: string;

    beforeAll(async () => {
      // 삭제 대상 사용자 생성
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/users",
        adminToken,
      )
        .send({
          loginId: "e2e_test_delete_target",
          name: "삭제대상",
          password: "TestPassword1!@#",
          userType: "ADMIN",
        })
        .expect(201);

      deleteTargetId = (res.body as SuccessResponse<UserSummary>).data.id;
    });

    it("사용자 삭제(비활성화) → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "delete",
        `/api/v1/users/${deleteTargetId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<{ message: string }>;
      expect(body.success).toBe(true);
      expect(body.data.message).toBe("사용자가 비활성화되었습니다");
    });

    it("삭제된 사용자 재조회 → deleted_at 설정됨", async () => {
      const deleted = await prisma.users.findUnique({
        where: { id: deleteTargetId },
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.deleted_at).not.toBeNull();
    });
  });

  // ============================================================
  // 7. PUT /api/v1/users/:id/roles — 역할 할당
  // ============================================================

  describe("PUT /api/v1/users/:id/roles", () => {
    it("사용자에게 역할 할당 → 200", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "e2e_test_user1" },
      });

      // 시드된 역할 하나 조회
      const role = await prisma.roles.findFirstOrThrow({
        where: { name: "SUPER_ADMIN" },
      });

      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/users/${user.id}/roles`,
        adminToken,
      )
        .send({ roleIds: [role.id] })
        .expect(200);

      const body = res.body as SuccessResponse<unknown>;
      expect(body.success).toBe(true);
    });

    it("존재하지 않는 역할 ID 할당 → 에러", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "e2e_test_user1" },
      });

      const fakeRoleId = "00000000-0000-0000-0000-000000000000";

      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/users/${user.id}/roles`,
        adminToken,
      ).send({ roleIds: [fakeRoleId] });

      // 400 또는 404 또는 500 (존재하지 않는 FK)
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // ============================================================
  // 8. GET /api/v1/users/:id/roles — 사용자 역할 조회
  // ============================================================

  describe("GET /api/v1/users/:id/roles", () => {
    it("사용자의 역할 목록 조회 → 200", async () => {
      const user = await prisma.users.findUniqueOrThrow({
        where: { login_id: "admin" },
      });

      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/users/${user.id}/roles`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<unknown>;
      expect(body.success).toBe(true);
    });
  });
});
