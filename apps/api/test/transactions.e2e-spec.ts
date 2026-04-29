import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface TransactionSummary {
  id: string;
  tran_no: string;
  tran_type: string;
  payment_method: string;
  status: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  vat_amount: number;
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

describe("Transactions API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  let testCompanyId: string;
  let testAgentId: string;
  let testMerchantId: string;
  let createdTransactionId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;
    prisma = getTestPrisma(app);
    await resetAdminUser(prisma);
    adminToken = await loginAsAdmin(server);

    // 테스트용 회사 생성
    const company = await prisma.companies.create({
      data: {
        company_name: "E2E테스트회사_거래",
        business_no: "9990010001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;

    // 테스트용 대리점 생성
    const agent = await prisma.agents.create({
      data: {
        company_id: testCompanyId,
        agent_code: "E2ETXAGT01",
        agent_name: "E2E거래테스트대리점",
        tree_path: "/temp",
        tree_depth: 0,
      },
    });
    testAgentId = agent.id;
    await prisma.agents.update({
      where: { id: agent.id },
      data: { tree_path: `/${agent.id}` },
    });

    // 테스트용 가맹점 생성 + ACTIVE 상태
    const merchant = await prisma.merchants.create({
      data: {
        company_id: testCompanyId,
        agent_id: testAgentId,
        merchant_code: "E2ETXMRC001",
        merchant_name: "E2E거래테스트가맹점",
        status: "ACTIVE",
        settlement_cycle: "D+2",
      },
    });
    testMerchantId = merchant.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.transactions.deleteMany({
      where: {
        tran_no: { startsWith: "TXN" },
        merchants: { merchant_code: "E2ETXMRC001" },
      },
    });
    await prisma.merchants.deleteMany({
      where: { merchant_code: "E2ETXMRC001" },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: "E2ETXAGT01" },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990010001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/transactions — 거래 생성
  // ============================================================

  describe("POST /api/v1/transactions", () => {
    it("유효한 데이터로 거래 생성 → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/transactions",
        adminToken,
      )
        .send({
          merchantId: testMerchantId,
          transactionType: "PAYMENT",
          paymentMethod: "CARD",
          amount: 50000,
          feeAmount: 1500,
          orderNo: "E2E-ORD-001",
          orderName: "E2E테스트주문",
        })
        .expect(201);

      const body = res.body as SuccessResponse<TransactionSummary>;
      expect(body.success).toBe(true);
      expect(body.data.tran_no).toMatch(/^TXN/);
      expect(body.data.status).toBe("APPROVED");
      expect(body.data.amount).toBe(50000);
      expect(body.data.fee_amount).toBe(1500);
      // BigInt → Number 변환 확인
      expect(typeof body.data.amount).toBe("number");
      createdTransactionId = body.data.id;
    });

    it("금액 100 미만 → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        "/api/v1/transactions",
        adminToken,
      )
        .send({
          merchantId: testMerchantId,
          transactionType: "PAYMENT",
          paymentMethod: "CARD",
          amount: 50,
          orderNo: "E2E-ORD-FAIL",
          orderName: "최소금액미달",
        })
        .expect(400);
    });

    it("필수 필드 누락 (orderNo) → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        "/api/v1/transactions",
        adminToken,
      )
        .send({
          merchantId: testMerchantId,
          transactionType: "PAYMENT",
          paymentMethod: "CARD",
          amount: 10000,
          orderName: "필수누락테스트",
        })
        .expect(400);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server)
        .post("/api/v1/transactions")
        .send({
          merchantId: testMerchantId,
          transactionType: "PAYMENT",
          paymentMethod: "CARD",
          amount: 10000,
          orderNo: "E2E-NO-AUTH",
          orderName: "인증없음",
        })
        .expect(401);
    });
  });

  // ============================================================
  // 2. GET /api/v1/transactions — 거래 목록 + 페이지네이션
  // ============================================================

  describe("GET /api/v1/transactions", () => {
    it("거래 목록 조회 → 200 + 페이지네이션 메타", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it("merchantId 필터 적용", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/transactions?merchantId=${testMerchantId}`,
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<TransactionSummary>;
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 3. GET /api/v1/transactions/:id — 거래 상세
  // ============================================================

  describe("GET /api/v1/transactions/:id", () => {
    it("거래 상세 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/transactions/${createdTransactionId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<TransactionSummary>;
      expect(body.data.tran_no).toMatch(/^TXN/);
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/transactions/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });
  });

  // ============================================================
  // 4. POST /api/v1/transactions/:id/cancel — 거래 취소
  // ============================================================

  describe("POST /api/v1/transactions/:id/cancel", () => {
    it("APPROVED 거래 취소 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/transactions/${createdTransactionId}/cancel`,
        adminToken,
      )
        .send({ reason: "E2E 테스트 취소 사유" })
        .expect(200);

      const body = res.body as SuccessResponse<TransactionSummary>;
      expect(body.data.status).toBe("CANCELLED");
    });

    it("이미 취소된 거래 재취소 → 409", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/transactions/${createdTransactionId}/cancel`,
        adminToken,
      )
        .send({ reason: "재취소 시도" })
        .expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });
  });
});
