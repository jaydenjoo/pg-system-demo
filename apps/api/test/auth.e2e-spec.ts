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

interface ErrorResponse {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

interface LoginData {
  requireMfa: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

describe("Auth API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;
    prisma = getTestPrisma(app);
    // 이전 테스트 실행에서 변경된 admin 상태 초기화
    await resetAdminUser(prisma);
  });

  afterAll(async () => {
    // 비밀번호 변경 테스트 후 복원을 위해 login_history/refresh_tokens 정리
    await prisma.login_history.deleteMany();
    await prisma.refresh_tokens.deleteMany();
    await closeTestApp(app);
  });

  // ============================================================
  // 1. 로그인 성공 테스트
  // ============================================================

  describe("POST /api/v1/auth/login - 로그인 성공", () => {
    it("유효한 자격 증명으로 로그인하면 accessToken과 refreshToken을 반환한다", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const body = res.body as SuccessResponse<LoginData>;
      expect(body.success).toBe(true);
      expect(body.data.requireMfa).toBe(false);
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.expiresIn).toBe(900);
    });

    it("반환된 accessToken은 유효한 JWT 형식이다", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const body = res.body as SuccessResponse<LoginData>;
      const token = body.data.accessToken;
      expect(token).toBeDefined();

      // JWT는 3개 파트(header.payload.signature)로 구성
      const parts = token!.split(".");
      expect(parts).toHaveLength(3);

      // payload 디코딩하여 sub, loginId 필드 확인
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      ) as { sub: string; loginId: string; userType: string };
      expect(payload.sub).toBeDefined();
      expect(payload.loginId).toBe("admin");
      expect(payload.userType).toBe("ADMIN");
    });
  });

  // ============================================================
  // 2. 로그인 실패 테스트
  // ============================================================

  describe("POST /api/v1/auth/login - 로그인 실패", () => {
    it("잘못된 비밀번호 → 401 + AUTH_002", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "WrongPassword1!" })
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_002");
    });

    it("존재하지 않는 사용자 → 401 + AUTH_002", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "nonexistent_user", password: "SomePassword1!" })
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_002");
    });

    it("loginId 미전송 → 400 (ValidationPipe)", async () => {
      await request(server)
        .post("/api/v1/auth/login")
        .send({ password: "SomePassword1!" })
        .expect(400);
    });

    it("password 미전송 → 400 (ValidationPipe)", async () => {
      await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin" })
        .expect(400);
    });
  });

  // ============================================================
  // 3. JWT 토큰 인증 테스트
  // ============================================================

  describe("JWT 토큰 인증", () => {
    it("유효한 토큰으로 GET /api/v1/users/me → 200", async () => {
      const token = await loginAsAdmin(server);

      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/users/me",
        token,
      ).expect(200);

      const body = res.body as SuccessResponse<{ login_id: string }>;
      expect(body.success).toBe(true);
      expect(body.data.login_id).toBe("admin");
    });

    it("토큰 없이 GET /api/v1/users/me → 401", async () => {
      const res = await request(server).get("/api/v1/users/me").expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_001");
    });

    it("잘못된 토큰으로 GET /api/v1/users/me → 401", async () => {
      const res = await request(server)
        .get("/api/v1/users/me")
        .set("Authorization", "Bearer invalid.token.here")
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_001");
    });
  });

  // ============================================================
  // 4. 토큰 갱신 테스트
  // ============================================================

  describe("POST /api/v1/auth/refresh - 토큰 갱신", () => {
    it("유효한 refreshToken으로 새 accessToken 발급", async () => {
      // 먼저 로그인하여 refreshToken 획득
      const loginRes = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const loginBody = loginRes.body as SuccessResponse<LoginData>;
      const refreshToken = loginBody.data.refreshToken;
      expect(refreshToken).toBeDefined();

      const refreshRes = await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      const refreshBody = refreshRes.body as SuccessResponse<{
        accessToken: string;
        expiresIn: number;
      }>;
      expect(refreshBody.success).toBe(true);
      expect(refreshBody.data.accessToken).toBeDefined();
      expect(refreshBody.data.expiresIn).toBe(900);
    });

    it("잘못된 refreshToken → 401", async () => {
      const res = await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "invalid-refresh-token" })
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_006");
    });
  });

  // ============================================================
  // 5. 로그아웃 테스트
  // ============================================================

  describe("POST /api/v1/auth/logout - 로그아웃", () => {
    it("로그아웃 성공 → 200", async () => {
      // 로그인하여 토큰 획득
      const loginRes = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const loginBody = loginRes.body as SuccessResponse<LoginData>;
      const accessToken = loginBody.data.accessToken!;
      const refreshToken = loginBody.data.refreshToken!;

      const logoutRes = await request(server)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      const logoutBody = logoutRes.body as SuccessResponse<{
        message: string;
      }>;
      expect(logoutBody.success).toBe(true);
      expect(logoutBody.data.message).toBe("로그아웃되었습니다");
    });

    it("로그아웃 후 동일 refreshToken으로 갱신 시도 → 401", async () => {
      // 로그인
      const loginRes = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const loginBody = loginRes.body as SuccessResponse<LoginData>;
      const accessToken = loginBody.data.accessToken!;
      const refreshToken = loginBody.data.refreshToken!;

      // 로그아웃
      await request(server)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // 로그아웃 후 refreshToken으로 갱신 시도
      const refreshRes = await request(server)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(401);

      const body = refreshRes.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_006");
    });
  });

  // ============================================================
  // 6. 비밀번호 변경 테스트
  // ============================================================

  describe("POST /api/v1/auth/password/change - 비밀번호 변경", () => {
    const originalPassword = "Admin1234!@";
    const newPassword = "NewSecurePass1!@#";

    afterAll(async () => {
      // 비밀번호를 원래대로 복원 (다른 테스트에 영향을 주지 않도록)
      // loginAsAdmin은 originalPassword를 사용하므로, 직접 newPassword로 로그인
      const loginRes = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: newPassword });

      if (loginRes.status === 200) {
        const body = loginRes.body as SuccessResponse<LoginData>;
        const token = body.data.accessToken!;
        await request(server)
          .post("/api/v1/auth/password/change")
          .set("Authorization", `Bearer ${token}`)
          .send({
            currentPassword: newPassword,
            newPassword: originalPassword,
          });
      }
    });

    it("비밀번호 변경 성공 → 200", async () => {
      const token = await loginAsAdmin(server);

      const res = await request(server)
        .post("/api/v1/auth/password/change")
        .set("Authorization", `Bearer ${token}`)
        .send({
          currentPassword: originalPassword,
          newPassword: newPassword,
        })
        .expect(200);

      const body = res.body as SuccessResponse<{ message: string }>;
      expect(body.success).toBe(true);
      expect(body.data.message).toBe("비밀번호가 변경되었습니다");

      // 새 비밀번호로 로그인 가능 확인
      await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: newPassword })
        .expect(200);
    });

    it("현재 비밀번호 틀리면 → 400", async () => {
      // 비밀번호가 newPassword로 변경된 상태에서 테스트
      const loginRes = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: newPassword })
        .expect(200);

      const loginBody = loginRes.body as SuccessResponse<LoginData>;
      const token = loginBody.data.accessToken!;

      const res = await request(server)
        .post("/api/v1/auth/password/change")
        .set("Authorization", `Bearer ${token}`)
        .send({
          currentPassword: "WrongCurrentPass1!",
          newPassword: "AnotherNewPass1!@",
        })
        .expect(400);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_002");
    });
  });

  // ============================================================
  // 7. Rate Limiting 테스트 (계정 잠금)
  // ============================================================

  describe("Rate Limiting - 연속 로그인 실패 시 계정 잠금", () => {
    const testLoginId = "rate_limit_test_user";
    const testPassword = "TestPassword1!@#";

    beforeAll(async () => {
      // 테스트용 사용자 생성
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash(testPassword, 12);
      await prisma.users.create({
        data: {
          login_id: testLoginId,
          password_hash: hash,
          name: "Rate Limit Test",
          email: "ratelimit@test.com",
          user_type: "ADMIN",
          status: "ACTIVE",
          failed_login_count: 0,
        },
      });
    });

    afterAll(async () => {
      // 테스트 사용자 관련 데이터 정리
      const user = await prisma.users.findUnique({
        where: { login_id: testLoginId },
      });
      if (user) {
        await prisma.login_history.deleteMany({
          where: { user_id: user.id },
        });
        await prisma.refresh_tokens.deleteMany({
          where: { user_id: user.id },
        });
        await prisma.user_roles.deleteMany({
          where: { user_id: user.id },
        });
        await prisma.users.delete({ where: { id: user.id } });
      }
    });

    it("5회 연속 로그인 실패 후 계정 잠금 → AUTH_003", async () => {
      // 5회 연속 실패
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post("/api/v1/auth/login")
          .send({ loginId: testLoginId, password: "WrongPassword1!" })
          .expect(401);
      }

      // 6번째 시도 → 잠금 상태
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: testLoginId, password: testPassword })
        .expect(401);

      const body = res.body as ErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("AUTH_003");
    });
  });
});
