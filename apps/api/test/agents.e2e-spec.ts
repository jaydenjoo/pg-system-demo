import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp } from "./helpers/test-app";
import { loginAsAdmin, authenticatedRequest } from "./helpers/auth-helper";
import { getTestPrisma, resetAdminUser } from "./helpers/db-helper";
import { PrismaService } from "../src/prisma/prisma.service";

type HttpServer = Parameters<typeof request>[0];

interface AgentSummary {
  id: string;
  agent_code: string;
  agent_name: string;
  status: string;
  tree_path: string;
  tree_depth: number;
  bank_account: string | null;
  companies: { id: string; company_name: string };
}

interface AgentDetail extends AgentSummary {
  parent_id: string | null;
  merchants: Array<{
    id: string;
    merchant_code: string;
    merchant_name: string;
    status: string;
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

describe("Agents API (e2e)", () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;

  // 테스트에서 생성한 리소스 ID 추적
  let testCompanyId: string;
  let parentAgentId: string;
  let childAgentId: string;

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
        company_name: "E2E테스트회사_대리점",
        business_no: "9990002001",
        representative: "테스트대표",
        business_type: "법인",
      },
    });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (자식→부모 순서)
    await prisma.merchants.deleteMany({
      where: { merchant_code: { startsWith: "E2EAGTMRC" } },
    });
    await prisma.agents.deleteMany({
      where: { agent_code: { startsWith: "E2EAGT" } },
    });
    await prisma.companies.deleteMany({
      where: { business_no: "9990002001" },
    });
    await closeTestApp(app);
  });

  // ============================================================
  // 1. POST /api/v1/agents — 대리점 생성
  // ============================================================

  describe("POST /api/v1/agents", () => {
    it("최상위 대리점 생성 → 201 + tree_depth=0", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/agents",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGT001",
          agentName: "E2E최상위대리점",
          bankName: "우리은행",
          bankAccount: "11223344556677",
          bankHolder: "김대리",
        })
        .expect(201);

      const body = res.body as SuccessResponse<AgentSummary>;
      expect(body.data.agent_code).toBe("E2EAGT001");
      expect(body.data.agent_name).toBe("E2E최상위대리점");
      expect(body.data.status).toBe("ACTIVE");
      expect(body.data.tree_depth).toBe(0);
      expect(body.data.tree_path).toMatch(/^\/[0-9a-f-]+$/);
      parentAgentId = body.data.id;
    });

    it("하위 대리점 생성 → 201 + tree_depth=1 + tree_path 부모 포함", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/agents",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGT002",
          agentName: "E2E하위대리점",
          parentAgentId: parentAgentId,
        })
        .expect(201);

      const body = res.body as SuccessResponse<AgentSummary>;
      expect(body.data.tree_depth).toBe(1);
      expect(body.data.tree_path).toContain(parentAgentId);
      childAgentId = body.data.id;
    });

    it("중복 agentCode → 409", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/agents",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGT001",
          agentName: "중복대리점",
        })
        .expect(409);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });

    it("agentCode 소문자 → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/agents", adminToken)
        .send({
          companyId: testCompanyId,
          agentCode: "lowercase01",
          agentName: "소문자대리점",
        })
        .expect(400);
    });

    it("필수 필드 누락 (agentName) → 400", async () => {
      await authenticatedRequest(server, "post", "/api/v1/agents", adminToken)
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGT999",
        })
        .expect(400);
    });
  });

  // ============================================================
  // 2. GET /api/v1/agents — 대리점 목록 + 페이지네이션
  // ============================================================

  describe("GET /api/v1/agents", () => {
    it("대리점 목록 조회 → 200 + 페이지네이션 메타", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        "/api/v1/agents",
        adminToken,
      ).expect(200);

      const body = res.body as PaginatedResponse<AgentSummary>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it("인증 없이 요청 → 401", async () => {
      await request(server).get("/api/v1/agents").expect(401);
    });
  });

  // ============================================================
  // 3. GET /api/v1/agents/:id — 대리점 상세 + 마스킹
  // ============================================================

  describe("GET /api/v1/agents/:id", () => {
    it("대리점 상세 조회 → 200 + bank_account 마스킹", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/agents/${parentAgentId}`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<AgentDetail>;
      expect(body.data.agent_code).toBe("E2EAGT001");
      // bank_account 마스킹: "****6677"
      expect(body.data.bank_account).toBe("****6677");
      expect(body.data.bank_account).not.toBe("11223344556677");
    });

    it("존재하지 않는 UUID → 404", async () => {
      await authenticatedRequest(
        server,
        "get",
        "/api/v1/agents/00000000-0000-0000-0000-000000000000",
        adminToken,
      ).expect(404);
    });
  });

  // ============================================================
  // 4. PUT /api/v1/agents/:id — 대리점 수정
  // ============================================================

  describe("PUT /api/v1/agents/:id", () => {
    it("대리점명 수정 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "put",
        `/api/v1/agents/${parentAgentId}`,
        adminToken,
      )
        .send({ agentName: "수정된대리점명" })
        .expect(200);

      const body = res.body as SuccessResponse<AgentSummary>;
      expect(body.data.agent_name).toBe("수정된대리점명");
    });
  });

  // ============================================================
  // 5. GET /api/v1/agents/:id/sub-agents — 하위 대리점
  // ============================================================

  describe("GET /api/v1/agents/:id/sub-agents", () => {
    it("하위 대리점 목록 조회 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/agents/${parentAgentId}/sub-agents`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<AgentSummary[]>;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.some((a) => a.id === childAgentId)).toBe(true);
    });

    it("하위 대리점 없는 노드 → 200 + 빈 배열", async () => {
      const res = await authenticatedRequest(
        server,
        "get",
        `/api/v1/agents/${childAgentId}/sub-agents`,
        adminToken,
      ).expect(200);

      const body = res.body as SuccessResponse<AgentSummary[]>;
      expect(body.data).toEqual([]);
    });
  });

  // ============================================================
  // 6. POST /api/v1/agents/:id/status — 상태 변경
  // ============================================================

  describe("POST /api/v1/agents/:id/status", () => {
    it("ACTIVE → SUSPENDED 상태 변경 → 200", async () => {
      const res = await authenticatedRequest(
        server,
        "post",
        `/api/v1/agents/${childAgentId}/status`,
        adminToken,
      )
        .send({ status: "SUSPENDED" })
        .expect(200);

      const body = res.body as SuccessResponse<AgentSummary>;
      expect(body.data.status).toBe("SUSPENDED");
    });

    it("유효하지 않은 상태값 → 400", async () => {
      await authenticatedRequest(
        server,
        "post",
        `/api/v1/agents/${childAgentId}/status`,
        adminToken,
      )
        .send({ status: "INVALID_STATUS" })
        .expect(400);
    });

    it("비활성 부모 대리점에 자식 생성 시도 → 400 (AGENT_003)", async () => {
      // childAgentId는 위에서 SUSPENDED 상태로 변경됨
      const res = await authenticatedRequest(
        server,
        "post",
        "/api/v1/agents",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGTFAIL",
          agentName: "비활성부모테스트",
          parentAgentId: childAgentId,
        })
        .expect(400);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });
  });

  // ============================================================
  // 7. DELETE /api/v1/agents/:id — 대리점 삭제
  // ============================================================

  describe("DELETE /api/v1/agents/:id", () => {
    it("하위 대리점이 있는 대리점 삭제 시도 → 400 (AGENT_004)", async () => {
      const res = await authenticatedRequest(
        server,
        "delete",
        `/api/v1/agents/${parentAgentId}`,
        adminToken,
      ).expect(400);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });

    it("연결된 가맹점이 있는 대리점 삭제 시도 → 400 (AGENT_005)", async () => {
      // 삭제 테스트용 대리점 + 가맹점 생성
      const agentRes = await authenticatedRequest(
        server,
        "post",
        "/api/v1/agents",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentCode: "E2EAGTDEL05",
          agentName: "삭제테스트대리점005",
        })
        .expect(201);

      const agentIdForDel = (agentRes.body as SuccessResponse<AgentSummary>)
        .data.id;

      await authenticatedRequest(
        server,
        "post",
        "/api/v1/merchants",
        adminToken,
      )
        .send({
          companyId: testCompanyId,
          agentId: agentIdForDel,
          merchantCode: "E2EAGTMRC01",
          merchantName: "삭제방지가맹점",
        })
        .expect(201);

      const res = await authenticatedRequest(
        server,
        "delete",
        `/api/v1/agents/${agentIdForDel}`,
        adminToken,
      ).expect(400);

      const body = res.body as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
    });

    it("독립 대리점 삭제 → 204", async () => {
      // childAgent를 먼저 삭제 (하위 없으므로 가능)
      await authenticatedRequest(
        server,
        "delete",
        `/api/v1/agents/${childAgentId}`,
        adminToken,
      ).expect(204);
    });

    it("삭제된 대리점 재조회 → 404 (소프트 삭제)", async () => {
      await authenticatedRequest(
        server,
        "get",
        `/api/v1/agents/${childAgentId}`,
        adminToken,
      ).expect(404);
    });

    it("DB에서 deleted_at 확인", async () => {
      const deleted = await prisma.agents.findUnique({
        where: { id: childAgentId },
      });
      expect(deleted).not.toBeNull();
      expect(deleted!.deleted_at).not.toBeNull();
    });
  });
});
