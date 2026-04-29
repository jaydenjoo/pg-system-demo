import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface MerchantSummary {
  id: string;
  merchant_code: string;
  merchant_name: string;
  status: string;
  settlement_cycle: string;
  bank_account: string | null;
  companies: { id: string; company_name: string };
  agents: { id: string; agent_code: string; agent_name: string } | null;
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

describe("Merchants API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  // 테스트에서 생성한 리소스 ID 추적
  let testCompanyId: string;
  let testAgentId: string;
  let createdMerchantId: string;

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
        company_name: "E2E테스트회사_가맹점",
        business_no: "9990001001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;

    // 테스트용 대리점 생성 (가맹점에 연결 필요)
    const agent = await prisma.agents.create({
      data: {
        company_id: testCompanyId,
        agent_code: "E2EMCAGENT01",
        agent_name: "E2E가맹점테스트대리점",
        tree_path: "/temp",
        tree_depth: 0,
      },
    });
    testAgentId = agent.id;
    // tree_path를 실제 ID로 업데이트
    await prisma.agents.update({
      where: { id: agent.id },
      data: { tree_path: `/${agent.id}` },
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.merchant_commissions.deleteMany({
      where: { merchants: { merchant_code: { startsWith: "E2EMRC" } } },
    });
    await prisma.merchant_terminals.deleteMany({
      where: { merchants: { merchant_code: { startsWith: "E2EMRC" } } },
    });
    await prisma.merchants.deleteMany({
      where: { merchant_code: { startsWith: "E2EMRC" } },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: "E2EMCAGENT01" },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990001001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/merchants — 가맹점 생성
  // ============================================================

  describe("POST /api/v1/merchants", () => {
    it("유효한 데이터로 가맹점 생성 → 201", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: testAgentId,
          merchantCode: "E2EMRC001",
          merchantName: "E2E테스트가맹점",
          bankName: "국민은행",
          bankAccount: "12345678901234",
          bankHolder: "홍길동",
        })
        .expect(201);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.merchant_code).toBe("E2EMRC001");
      expect(body.data.merchant_name).toBe("E2E테스트가맹점");
      expect(body.data.status).toBe("PENDING");
      expect(body.data.settlement_cycle).toBe("D+2");
      createdMerchantId = body.data.id;
    });

    it("중복 merchantCode → 409", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: testAgentId,
          merchantCode: "E2EMRC001",
          merchantName: "중복테스트",
        })
        .expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });

    it("merchantCode 소문자 → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: testAgentId,
          merchantCode: "lowercase01",
          merchantName: "소문자테스트",
        })
        .expect(400);
    });

    it("필수 필드 누락 (merchantName) → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: testAgentId,
          merchantCode: "E2EMRC999",
        })
        .expect(400);
    });
  });

  // ============================================================
  // 2. GET /api/v1/merchants — 가맹점 목록 + 페이지네이션
  // ============================================================

  describe("GET /api/v1/merchants", () => {
    it("가맹점 목록 조회 → 200 + 페이지네이션 메타", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/merchants",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<MerchantSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it("page, limit 파라미터 적용", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/merchants?page=1&limit=5",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<MerchantSummary>;
      expect(body.meta.limit).toBe(5);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/merchants").expect(401);
    });
  });

  // ============================================================
  // 3. GET /api/v1/merchants/:id — 가맹점 상세 + 마스킹
  // ============================================================

  describe("GET /api/v1/merchants/:id", () => {
    it("가맹점 상세 조회 → 200 + bank_account 마스킹", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/merchants/${createdMerchantId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.merchant_code).toBe("E2EMRC001");
      // bank_account 마스킹 확인: "****1234" 패턴
      expect(body.data.bank_account).toBe("****1234");
      expect(body.data.bank_account).not.toBe("12345678901234");
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/merchants/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });

    it("잘못된 UUID 형식 → 400", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/merchants/not-a-uuid",
        adminToken,
      ).expect(400);
    });
  });

  // ============================================================
  // 4. PUT /api/v1/merchants/:id — 가맹점 수정
  // ============================================================

  describe("PUT /api/v1/merchants/:id", () => {
    it("가맹점명 수정 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/merchants/${createdMerchantId}`,
        adminToken,
      )
        .send({ merchantName: "수정된가맹점명" })
        .expect(200);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.merchant_name).toBe("수정된가맹점명");
    });

    it("bank_account 수정 후에도 마스킹 반환", async () => {
      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/merchants/${createdMerchantId}`,
        adminToken,
      )
        .send({ bankAccount: "99887766554433" })
        .expect(200);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.bank_account).toBe("****4433");
    });
  });

  // ============================================================
  // 5. POST /api/v1/merchants/:id/status — 상태 변경
  // ============================================================

  describe("POST /api/v1/merchants/:id/status", () => {
    it("PENDING → ACTIVE 상태 변경 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/merchants/${createdMerchantId}/status`,
        adminToken,
      )
        .send({ status: "ACTIVE" })
        .expect(200);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.status).toBe("ACTIVE");
    });

    it("ACTIVE → SUSPENDED 상태 변경 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/merchants/${createdMerchantId}/status`,
        adminToken,
      )
        .send({ status: "SUSPENDED" })
        .expect(200);

      const body = res.body as SuccessResponse<MerchantSummary>;
      expect(body.data.status).toBe("SUSPENDED");
    });

    it("유효하지 않은 상태값 → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        `/api/v1/merchants/${createdMerchantId}/status`,
        adminToken,
      )
        .send({ status: "INVALID_STATUS" })
        .expect(400);
    });
  });

  // ============================================================
  // 6. DELETE /api/v1/merchants/:id — 가맹점 삭제 (소프트)
  // ============================================================

  describe("DELETE /api/v1/merchants/:id", () => {
    let deleteTargetId: string;

    beforeAll(async () => {
      // 삭제 전용 가맹점 생성
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: testAgentId,
          merchantCode: "E2EMRCDEL",
          merchantName: "삭제대상가맹점",
        })
        .expect(201);

      deleteTargetId = (res.body as SuccessResponse<MerchantSummary>).data.id;
    });

    it("가맹점 삭제 → 204", async () => {
      await authenticatedRequest(
        server,
        "delete",
        `/api/v1/merchants/${deleteTargetId}`,
        adminToken,
      ).expect(204);
    });

    it("삭제된 가맹점 재조회 → 404 (소프트 삭제)", async () => {
      await authenticatedRequest(
        server,
        "get",
        `/api/v1/merchants/${deleteTargetId}`,
        adminToken,
      ).expect(404);
    });

    it("DB에서 deleted_at 확인", async () => {
      const deleted = await prisma.merchants.findUnique({
        where: { id: deleteTargetId },
      });
      expect(deleted).not.toBeNull();
      expect(deleted!.deleted_at).not.toBeNull();
    });
  });
});
