import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface PgMarginSummary {
  id: string;
  payment_method: string;
  card_company: string | null;
  margin_rate: number;
  min_fee: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface CommissionSummary {
  id: string;
  commission_rate: number;
  payment_method: string;
  effective_from: string;
  effective_to: string | null;
}

interface CommissionHistory {
  entityType: string;
  entityId: string;
  data: unknown[];
}

interface SuccessResponse<T> {
  success: boolean;
  data: T;
}

describe("Commissions API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  let testCompanyId: string;
  let testAgentId: string;
  let testMerchantId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;
    prisma = getTestPrisma(app);
    await resetAdminUser(prisma);
    adminToken = await loginAsAdmin(server);

    // 테스트용 회사
    const company = await prisma.companies.create({
      data: {
        company_name: "E2E테스트회사_수수료",
        business_no: "9990030001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;

    // 테스트용 대리점
    const agent = await prisma.agents.create({
      data: {
        company_id: testCompanyId,
        agent_code: "E2ECMAGT01",
        agent_name: "E2E수수료테스트대리점",
        tree_path: "/temp",
        tree_depth: 0,
      },
    });
    testAgentId = agent.id;
    await prisma.agents.update({
      where: { id: agent.id },
      data: { tree_path: `/${agent.id}` },
    });

    // 테스트용 가맹점 (ACTIVE)
    const merchant = await prisma.merchants.create({
      data: {
        company_id: testCompanyId,
        agent_id: testAgentId,
        merchant_code: "E2ECMMRC001",
        merchant_name: "E2E수수료테스트가맹점",
        status: "ACTIVE",
        settlement_cycle: "D+2",
      },
    });
    testMerchantId = merchant.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.merchant_commissions.deleteMany({
      where: { merchants: { merchant_code: "E2ECMMRC001" } },
    });
    await prisma.agent_commissions.deleteMany({
      where: { agents: { agent_code: "E2ECMAGT01" } },
    });
    await prisma.pg_default_margins.deleteMany({
      where: { payment_method: "E2E_CARD" },
    });
    await prisma.merchants.deleteMany({
      where: { merchant_code: "E2ECMMRC001" },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: "E2ECMAGT01" },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990030001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/commissions/pg-margins — PG 마진 설정
  // ============================================================

  describe("POST /api/v1/commissions/pg-margins", () => {
    it("PG 기본 마진 설정 → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/commissions/pg-margins",
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          marginRate: "1.5",
          minFee: 100,
        })
        .expect(201);

      const body = res.body as SuccessResponse<PgMarginSummary>;
      expect(body.success).toBe(true);
      expect(body.data.margin_rate).toBe(1.5);
      expect(body.data.payment_method).toBe("E2E_CARD");
    });

    it("동일 결제수단 재설정 → 기존 만료 + 신규 생성", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/commissions/pg-margins",
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          marginRate: "2.0",
        })
        .expect(201);

      const body = res.body as SuccessResponse<PgMarginSummary>;
      expect(body.data.margin_rate).toBe(2);
    });
  });

  // ============================================================
  // 2. GET /api/v1/commissions/pg-margins — PG 마진 조회
  // ============================================================

  describe("GET /api/v1/commissions/pg-margins", () => {
    it("PG 마진 목록 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/commissions/pg-margins",
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<PgMarginSummary[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/commissions/pg-margins").expect(401);
    });
  });

  // ============================================================
  // 3. POST /api/v1/commissions/agents/:agentId — 대리점 수수료 설정
  // ============================================================

  describe("POST /api/v1/commissions/agents/:agentId", () => {
    it("대리점 수수료 설정 (PG 마진 이상) → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/commissions/agents/${testAgentId}`,
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          commissionRate: "2.5",
        })
        .expect(201);

      const body = res.body as SuccessResponse<CommissionSummary>;
      expect(body.success).toBe(true);
      expect(body.data.commission_rate).toBe(2.5);
    });

    it("PG 마진보다 낮은 수수료율 → 400 (STL_003)", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/commissions/agents/${testAgentId}`,
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          commissionRate: "0.5",
        })
        .expect(400);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });
  });

  // ============================================================
  // 4. POST /api/v1/commissions/merchants/:merchantId — 가맹점 수수료 설정
  // ============================================================

  describe("POST /api/v1/commissions/merchants/:merchantId", () => {
    it("가맹점 수수료 설정 (대리점 수수료 이상) → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/commissions/merchants/${testMerchantId}`,
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          commissionRate: "3.0",
        })
        .expect(201);

      const body = res.body as SuccessResponse<CommissionSummary>;
      expect(body.success).toBe(true);
      expect(body.data.commission_rate).toBe(3);
    });

    it("대리점 수수료보다 낮은 수수료율 → 400 (STL_003)", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/commissions/merchants/${testMerchantId}`,
        adminToken,
      )
        .send({
          paymentMethod: "E2E_CARD",
          commissionRate: "1.0",
        })
        .expect(400);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });
  });

  // ============================================================
  // 5. GET /api/v1/commissions/history/:entityType/:entityId — 수수료 이력
  // ============================================================

  describe("GET /api/v1/commissions/history/:entityType/:entityId", () => {
    it("대리점 수수료 이력 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/commissions/history/agent/${testAgentId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<CommissionHistory>;
      expect(body.success).toBe(true);
      expect(body.data.entityType).toBe("agent");
      expect(body.data.entityId).toBe(testAgentId);
      expect(Array.isArray(body.data.data)).toBe(true);
      expect(body.data.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
