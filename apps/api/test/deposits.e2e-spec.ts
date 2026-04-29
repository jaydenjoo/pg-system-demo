import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface DepositSummary {
  id: string;
  deposit_date: string;
  source: string;
  amount: number;
  matched_amount: number;
  unmatched_amount: number;
  reconcile_status: string;
}

interface DepositDetail extends DepositSummary {
  deposit_transactions: Array<{
    id: string;
    matched_amount: number;
    transactions: { id: string; tran_no: string };
  }>;
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

describe("Deposits API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  let testCompanyId: string;
  let testAgentId: string;
  let testMerchantId: string;
  let testTransactionId: string;
  let createdDepositId: string;

  const DEPOSIT_DATE = "2025-12-15";

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
        company_name: "E2E테스트회사_입금",
        business_no: "9990040001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;

    // 테스트용 대리점
    const agent = await prisma.agents.create({
      data: {
        company_id: testCompanyId,
        agent_code: "E2EDPAGT01",
        agent_name: "E2E입금테스트대리점",
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
        merchant_code: "E2EDPMRC001",
        merchant_name: "E2E입금테스트가맹점",
        status: "ACTIVE",
        settlement_cycle: "D+2",
      },
    });
    testMerchantId = merchant.id;

    // 매칭 대상 거래 생성 (APPROVED, 입금일과 동일 approved_at)
    const txn = await prisma.transactions.create({
      data: {
        merchant_id: testMerchantId,
        tran_no: `TXN${Date.now()}E2EDP01`,
        tran_type: "PAYMENT",
        payment_method: "CARD",
        status: "APPROVED",
        amount: BigInt(50000),
        fee_amount: BigInt(1500),
        net_amount: BigInt(48500),
        vat_amount: BigInt(4545),
        approved_at: new Date(DEPOSIT_DATE),
      },
    });
    testTransactionId = txn.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.deposit_transactions.deleteMany({
      where: { deposits: { source: { startsWith: "E2E" } } },
    });
    await prisma.deposits.deleteMany({
      where: { source: { startsWith: "E2E" } },
    });
    await prisma.transactions.deleteMany({
      where: { merchants: { merchant_code: "E2EDPMRC001" } },
    });
    await prisma.merchants.deleteMany({
      where: { merchant_code: "E2EDPMRC001" },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: "E2EDPAGT01" },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990040001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/deposits — 입금 등록
  // ============================================================

  describe("POST /api/v1/deposits", () => {
    it("입금 등록 → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/deposits",
        adminToken,
      )
        .send({
          depositDate: DEPOSIT_DATE,
          source: "E2E테스트은행",
          amount: 50000,
        })
        .expect(201);

      const body = res.body as SuccessResponse<DepositSummary>;
      expect(body.success).toBe(true);
      expect(body.data.amount).toBe(50000);
      expect(body.data.unmatched_amount).toBe(50000);
      expect(body.data.reconcile_status).toBe("PENDING");
      // BigInt → Number 확인
      expect(typeof body.data.amount).toBe("number");
      createdDepositId = body.data.id;
    });

    it("금액 0 이하 → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/deposits", adminToken)
        .send({
          depositDate: DEPOSIT_DATE,
          source: "E2E실패",
          amount: 0,
        })
        .expect(400);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server)
        .post("/api/v1/deposits")
        .send({
          depositDate: DEPOSIT_DATE,
          source: "E2E인증없음",
          amount: 10000,
        })
        .expect(401);
    });
  });

  // ============================================================
  // 2. GET /api/v1/deposits — 입금 목록
  // ============================================================

  describe("GET /api/v1/deposits", () => {
    it("입금 목록 조회 → 200 + 페이지네이션", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/deposits",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<DepositSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 3. GET /api/v1/deposits/:id — 입금 상세
  // ============================================================

  describe("GET /api/v1/deposits/:id", () => {
    it("입금 상세 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/deposits/${createdDepositId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<DepositDetail>;
      expect(body.data.source).toBe("E2E테스트은행");
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/deposits/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });
  });

  // ============================================================
  // 4. POST /api/v1/deposits/:id/reconcile — 자동 대사
  // ============================================================

  describe("POST /api/v1/deposits/:id/reconcile", () => {
    it("자동 대사 (동일 날짜 거래 매칭) → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/deposits/${createdDepositId}/reconcile`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<DepositSummary>;
      expect(body.success).toBe(true);
      // 50000원 입금 + 50000원 거래 → 완전 매칭
      expect(body.data.matched_amount).toBe(50000);
      expect(body.data.unmatched_amount).toBe(0);
      expect(body.data.reconcile_status).toBe("MATCHED");
    });
  });

  // ============================================================
  // 5. POST /api/v1/deposits/:id/match — 수동 매칭
  // ============================================================

  describe("POST /api/v1/deposits/:id/match", () => {
    let manualDepositId: string;
    let manualTxnId: string;

    beforeAll(async () => {
      // 수동 매칭용 새 거래
      const txn = await prisma.transactions.create({
        data: {
          merchant_id: testMerchantId,
          tran_no: `TXN${Date.now()}E2EDPMN`,
          tran_type: "PAYMENT",
          payment_method: "CARD",
          status: "APPROVED",
          amount: BigInt(30000),
          fee_amount: BigInt(900),
          net_amount: BigInt(29100),
          vat_amount: BigInt(2727),
          approved_at: new Date("2025-12-20"),
        },
      });
      manualTxnId = txn.id;

      // 수동 매칭용 입금 등록
      const depRes = await authenticatedRequest(
        server,
        "post",
        "/api/v1/deposits",
        adminToken,
      )
        .send({
          depositDate: "2025-12-20",
          source: "E2E수동매칭은행",
          amount: 30000,
        })
        .expect(201);

      manualDepositId = (depRes.body as SuccessResponse<DepositSummary>).data
        .id;
    });

    it("수동 매칭 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/deposits/${manualDepositId}/match`,
        adminToken,
      )
        .send({
          transactionId: manualTxnId,
          matchedAmount: 30000,
        })
        .expect(200);

      const body = res.body as SuccessResponse<{
        id: string;
        matched_amount: number;
      }>;
      expect(body.data.matched_amount).toBe(30000);
    });
  });

  // ============================================================
  // 6. DELETE /api/v1/deposits/:id/matches/:matchId — 매칭 해제
  // ============================================================

  describe("DELETE /api/v1/deposits/:id/matches/:matchId", () => {
    let unmatchDepositId: string;
    let matchRecordId: string;

    beforeAll(async () => {
      // 매칭 해제용 거래
      const txn = await prisma.transactions.create({
        data: {
          merchant_id: testMerchantId,
          tran_no: `TXN${Date.now()}E2EDPUM`,
          tran_type: "PAYMENT",
          payment_method: "CARD",
          status: "APPROVED",
          amount: BigInt(20000),
          fee_amount: BigInt(600),
          net_amount: BigInt(19400),
          vat_amount: BigInt(1818),
          approved_at: new Date("2025-12-25"),
        },
      });

      // 매칭 해제용 입금
      const depRes = await authenticatedRequest(
        server,
        "post",
        "/api/v1/deposits",
        adminToken,
      )
        .send({
          depositDate: "2025-12-25",
          source: "E2E매칭해제은행",
          amount: 20000,
        })
        .expect(201);

      unmatchDepositId = (depRes.body as SuccessResponse<DepositSummary>).data
        .id;

      // 수동 매칭 실행
      await authenticatedRequest(
        server,
        "post",
        `/api/v1/deposits/${unmatchDepositId}/match`,
        adminToken,
      )
        .send({
          transactionId: txn.id,
          matchedAmount: 20000,
        })
        .expect(200);

      // 매칭 레코드 ID 조회
      const detail = await authenticatedRequest(
        server,
        "get",
        `/api/v1/deposits/${unmatchDepositId}`,
        adminToken,
      ).expect(200);

      const detailBody = detail.body as SuccessResponse<DepositDetail>;
      matchRecordId = detailBody.data.deposit_transactions[0].id;
    });

    it("매칭 해제 → 200", async () => {
      await authenticatedRequest(
        server,
        "delete",
        `/api/v1/deposits/${unmatchDepositId}/matches/${matchRecordId}`,
        adminToken,
      ).expect(200);

      // 해제 후 상태 확인
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/deposits/${unmatchDepositId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<DepositSummary>;
      expect(body.data.unmatched_amount).toBe(20000);
      expect(body.data.reconcile_status).toBe("PENDING");
    });
  });
});
