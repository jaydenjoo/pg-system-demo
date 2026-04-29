import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface SettlementSummary {
  id: string;
  settlement_no: string;
  settlement_date: string;
  status: string;
  total_amount: number;
  total_fee: number;
  settlement_amount: number;
}

interface CalculateResult {
  merchantSettlements: number;
  agentSettlements: number;
}

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

describe("Settlements API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  let testCompanyId: string;
  let testAgentId: string;
  let testMerchantId: string;
  let settlementId: string;

  const SETTLEMENT_DATE = "2025-12-01";

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
        company_name: "E2E테스트회사_정산",
        business_no: "9990020001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;

    // 테스트용 대리점
    const agent = await prisma.agents.create({
      data: {
        company_id: testCompanyId,
        agent_code: "E2ESTAGT01",
        agent_name: "E2E정산테스트대리점",
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
        merchant_code: "E2ESTMRC001",
        merchant_name: "E2E정산테스트가맹점",
        status: "ACTIVE",
        settlement_cycle: "D+2",
      },
    });
    testMerchantId = merchant.id;

    // 정산 대상 거래 생성 (APPROVED 상태)
    await prisma.transactions.create({
      data: {
        merchant_id: testMerchantId,
        tran_no: `TXN${Date.now()}E2ESTL01`,
        tran_type: "PAYMENT",
        payment_method: "CARD",
        status: "APPROVED",
        amount: BigInt(100000),
        fee_amount: BigInt(3000),
        net_amount: BigInt(97000),
        vat_amount: BigInt(9091),
        approved_at: new Date("2025-11-30"),
      },
    });

    await prisma.transactions.create({
      data: {
        merchant_id: testMerchantId,
        tran_no: `TXN${Date.now()}E2ESTL02`,
        tran_type: "PAYMENT",
        payment_method: "CARD",
        status: "APPROVED",
        amount: BigInt(200000),
        fee_amount: BigInt(6000),
        net_amount: BigInt(194000),
        vat_amount: BigInt(18182),
        approved_at: new Date("2025-11-30"),
      },
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.agent_settlements.deleteMany({
      where: { agents: { agent_code: "E2ESTAGT01" } },
    });
    await prisma.settlements.deleteMany({
      where: { merchants: { merchant_code: "E2ESTMRC001" } },
    });
    await prisma.transactions.deleteMany({
      where: { merchants: { merchant_code: "E2ESTMRC001" } },
    });
    await prisma.merchants.deleteMany({
      where: { merchant_code: "E2ESTMRC001" },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: "E2ESTAGT01" },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990020001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/settlements/calculate — 정산 산출
  // ============================================================

  describe("POST /api/v1/settlements/calculate", () => {
    it("정산 산출 → 201 + 가맹점/대리점 정산 건수", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/settlements/calculate",
        adminToken,
      )
        .send({
          settlementDate: SETTLEMENT_DATE,
          periodFrom: "2025-11-01",
          periodTo: "2025-11-30",
        })
        .expect(201);

      const body = res.body as SuccessResponse<CalculateResult>;
      expect(body.success).toBe(true);
      expect(body.data.merchantSettlements).toBeGreaterThanOrEqual(1);
      expect(body.data.agentSettlements).toBeGreaterThanOrEqual(1);
    });

    it("동일 정산일 중복 산출 → 에러", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/settlements/calculate",
        adminToken,
      ).send({
        settlementDate: SETTLEMENT_DATE,
        periodFrom: "2025-11-01",
        periodTo: "2025-11-30",
      });

      // 중복 정산일은 409 또는 400
      expect([400, 409]).toContain(res.status);
    });
  });

  // ============================================================
  // 2. GET /api/v1/settlements — 정산 목록
  // ============================================================

  describe("GET /api/v1/settlements", () => {
    it("정산 목록 조회 → 200 + 페이지네이션", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/settlements",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<SettlementSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(1);

      // 첫 번째 정산 ID 저장
      settlementId = body.data[0].id;
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/settlements").expect(401);
    });
  });

  // ============================================================
  // 3. GET /api/v1/settlements/:id — 정산 상세
  // ============================================================

  describe("GET /api/v1/settlements/:id", () => {
    it("정산 상세 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/settlements/${settlementId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<SettlementSummary>;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("CALCULATED");
    });
  });

  // ============================================================
  // 4. POST /api/v1/settlements/:id/confirm — 정산 확정
  // ============================================================

  describe("POST /api/v1/settlements/:id/confirm", () => {
    it("CALCULATED → CONFIRMED 상태 변경 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/settlements/${settlementId}/confirm`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<SettlementSummary>;
      expect(body.data.status).toBe("CONFIRMED");
    });

    it("이미 CONFIRMED인 정산 재확정 → 409", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/settlements/${settlementId}/confirm`,
        adminToken,
      ).expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });
  });

  // ============================================================
  // 5. POST /api/v1/settlements/:id/complete — 정산 완료 (송금)
  // ============================================================

  describe("POST /api/v1/settlements/:id/complete", () => {
    it("CONFIRMED → REMITTED 상태 변경 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/settlements/${settlementId}/complete`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<SettlementSummary>;
      expect(body.data.status).toBe("REMITTED");
    });
  });

  // ============================================================
  // 6. GET /api/v1/settlements/agents — 대리점 정산 목록
  // ============================================================

  describe("GET /api/v1/settlements/agents", () => {
    it("대리점 정산 목록 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/settlements/agents",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<unknown>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});
