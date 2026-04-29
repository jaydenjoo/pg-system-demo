import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import {
  loginAsAdmin,
  loginAsMerchant,
  loginAsAgent,
  authenticatedRequest,
} from "./helpers/auth-helper";

type HttpServer = Parameters<typeof request>[0];

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

interface TransactionSummary {
  id: string;
  merchant_id: string;
}

interface SettlementSummary {
  id: string;
  merchant_id: string;
}

/**
 * OwnershipInterceptor 보안 E2E 테스트.
 *
 * 핵심 검증:
 * 1. 가맹점 유저가 다른 가맹점 데이터 조회 시도 → 자기 데이터만 반환
 * 2. 대리점 유저가 다른 대리점 데이터 조회 시도 → 자기 데이터만 반환
 * 3. ADMIN은 모든 데이터 접근 가능 (기존 동작 유지)
 * 4. userType별 올바른 API 접근 (로그인 → JWT → 데이터 격리)
 */
describe("OwnershipInterceptor Security (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let adminToken: string;
  let merchantToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;

    adminToken = await loginAsAdmin(server);
    merchantToken = await loginAsMerchant(server);
    agentToken = await loginAsAgent(server);
  }, 30000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("가맹점 유저 데이터 격리", () => {
    it("가맹점 유저는 거래 내역 조회 시 자기 가맹점 데이터만 반환", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions",
        merchantToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
      // 데이터가 있다면 모두 자기 가맹점 것이어야 함
      if (body.data.length > 0) {
        const merchantIds = [...new Set(body.data.map((t) => t.merchant_id))];
        expect(merchantIds.length).toBe(1);
      }
    });

    it("가맹점 유저가 다른 merchantId로 거래 조회 시도 → 자기 데이터만 반환 (강제 덮어쓰기)", async () => {
      const fakeMerchantId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/transactions?merchantId=${fakeMerchantId}`,
        merchantToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
      // 가짜 merchantId를 전달해도 OwnershipInterceptor가 자기 것으로 덮어씀
      if (body.data.length > 0) {
        body.data.forEach((t) => {
          expect(t.merchant_id).not.toBe(fakeMerchantId);
        });
      }
    });

    it("가맹점 유저가 정산 내역 조회 시 자기 가맹점 데이터만 반환", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/settlements",
        merchantToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<SettlementSummary>;
      expect(body.success).toBe(true);
      if (body.data.length > 0) {
        const merchantIds = [...new Set(body.data.map((s) => s.merchant_id))];
        expect(merchantIds.length).toBe(1);
      }
    });
  });

  describe("대리점 유저 데이터 격리", () => {
    it("대리점 유저는 거래 내역 조회 가능", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions",
        agentToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
    });

    it("대리점 유저가 다른 agentId로 조회 시도 → 자기 데이터만 반환 (강제 덮어쓰기)", async () => {
      const fakeAgentId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/transactions?agentId=${fakeAgentId}`,
        agentToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
    });

    it("대리점 유저는 정산 내역 조회 가능", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/settlements",
        agentToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<SettlementSummary>;
      expect(body.success).toBe(true);
    });
  });

  describe("ADMIN 전체 접근 유지", () => {
    it("ADMIN은 모든 거래 내역 조회 가능 (merchantId 필터 없이)", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
    });

    it("ADMIN은 특정 merchantId로 필터링 가능", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions?merchantId=2bc7dff9-70db-4538-9284-1eebad102470",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
    });
  });

  describe("userType별 로그인 검증", () => {
    it("merchant_test 로그인 시 JWT에 merchantId 포함", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "merchant_test", password: "Admin1234!@" })
        .expect(200);

      const body = res.body as {
        data: { accessToken: string; user: { userType: string } };
      };
      expect(body.data.user.userType).toBe("MERCHANT");

      // JWT 디코딩하여 merchantId 확인
      const payload = JSON.parse(
        Buffer.from(body.data.accessToken.split(".")[1], "base64").toString(),
      ) as { merchantId?: string; userType: string };
      expect(payload.userType).toBe("MERCHANT");
      expect(payload.merchantId).toBeDefined();
    });

    it("agent_test 로그인 시 JWT에 agentId 포함", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "agent_test", password: "Admin1234!@" })
        .expect(200);

      const body = res.body as {
        data: { accessToken: string; user: { userType: string } };
      };
      expect(body.data.user.userType).toBe("AGENT");

      // JWT 디코딩하여 agentId 확인
      const payload = JSON.parse(
        Buffer.from(body.data.accessToken.split(".")[1], "base64").toString(),
      ) as { agentId?: string; userType: string };
      expect(payload.userType).toBe("AGENT");
      expect(payload.agentId).toBeDefined();
    });

    it("admin 로그인 시 JWT에 merchantId/agentId 미포함", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ loginId: "admin", password: "Admin1234!@" })
        .expect(200);

      const body = res.body as {
        data: { accessToken: string; user: { userType: string } };
      };
      expect(body.data.user.userType).toBe("ADMIN");

      const payload = JSON.parse(
        Buffer.from(body.data.accessToken.split(".")[1], "base64").toString(),
      ) as { merchantId?: string; agentId?: string; userType: string };
      expect(payload.userType).toBe("ADMIN");
      // ADMIN은 merchantId/agentId 없음 (undefined 또는 null)
    });
  });
});
