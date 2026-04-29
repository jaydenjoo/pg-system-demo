// ============================================================
// Phase 8 — PG Gateway 취소 E2E 통합 테스트
// 전액 취소 + 부분 취소 × 3회 + 취소 에러 케이스
// ============================================================
import type { INestApplication } from '@nestjs/common';
import { ERROR_CODES, PG_PAYMENT_STATUS } from '@pg-system/shared';

import { createTestApp, closeTestApp } from './helpers/test-app';
import { loginAsAdmin, authenticatedRequest } from './helpers/auth-helper';
import { getTestPrisma, cleanupTestData } from './helpers/db-helper';
import { pgRequest } from './helpers/pg-request-helper';
import { PrismaService } from '../src/prisma/prisma.service';

type HttpServer = Parameters<typeof import('supertest')['default']>[0];

// ============================================================
describe('PG Gateway Cancel E2E', () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let adminToken: string;
  let merchantId: string;
  let secretKey: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    server = testApp.server;
    prisma = getTestPrisma(app);
    adminToken = await loginAsAdmin(server);

    // 1. 회사 생성
    const company = await prisma.companies.create({
      data: {
        company_name: 'E2E취소테스트회사',
        business_no: '8880010002',
        representative: '취소테스트대표',
        business_type: '법인',
      },
    });

    // 2. 대리점 생성
    const agent = await prisma.agents.create({
      data: {
        company_id: company.id,
        agent_code: 'E2ECANCLAGT01',
        agent_name: 'E2E 취소 테스트대리점',
        tree_path: '/temp',
        tree_depth: 0,
      },
    });
    await prisma.agents.update({
      where: { id: agent.id },
      data: { tree_path: `/${agent.id}` },
    });

    // 3. 가맹점 생성
    const merchant = await prisma.merchants.create({
      data: {
        company_id: company.id,
        agent_id: agent.id,
        merchant_code: 'E2ECANCMRC01',
        merchant_name: 'E2E 취소 테스트가맹점',
        status: 'ACTIVE',
        settlement_cycle: 'D+2',
      },
    });
    merchantId = merchant.id;

    // 4. API 키 발급
    const apiKeyRes = await authenticatedRequest(server, 'post', '/pg/v1/api-keys', adminToken)
      .send({ merchantId })
      .expect(201);

    secretKey = (apiKeyRes.body as { data: { secretKey: string } }).data.secretKey;
  });

  afterAll(async () => {
    await cleanupTestData(prisma);
    await closeTestApp(app);
  });

  /** 결제 생성 → 승인까지 완료하고 paymentKey 반환 */
  async function createAndConfirmPayment(
    orderId: string,
    amount: number,
  ): Promise<{ paymentKey: string }> {
    const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
      .send({ orderId, amount, orderName: '취소테스트' })
      .expect(201);
    const paymentKey = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

    await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
      .send({ paymentKey, orderId, amount })
      .expect(200);

    return { paymentKey };
  }

  // ============================================================
  // 시나리오 A: 전액 취소
  // ============================================================
  describe('시나리오 A: 전액 취소', () => {
    let canceledPaymentKey: string;

    // TC-CANCEL-01: 결제 → 전액 취소 → CANCELED 상태
    it('TC-CANCEL-01: 결제 → 전액 취소 → status=CANCELED', async () => {
      const { paymentKey } = await createAndConfirmPayment('CANCEL-001', 15000);
      canceledPaymentKey = paymentKey;

      const res = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '고객 요청' })
        .expect(200);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.status).toBe(PG_PAYMENT_STATUS.CANCELED);
    });

    // TC-CANCEL-02: 전액 취소 후 재취소 시도 → 400 (TXN_003)
    it('TC-CANCEL-02: 전액 취소 후 재취소 → 400 (TXN_003)', async () => {
      const res = await pgRequest(server, 'post', `/pg/v1/payments/${canceledPaymentKey}/cancel`, secretKey)
        .send({ cancelReason: '재취소 시도' })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.TXN_003);
    });
  });

  // ============================================================
  // 시나리오 B: 부분 취소 × 3회 + 누적 검증
  // ============================================================
  describe('시나리오 B: 부분 취소 × 3회 + 누적 검증', () => {
    // TC-CANCEL-03: 30000원 결제 → 부분 취소 3회 (10000 + 10000 + 10000)
    it('TC-CANCEL-03: 부분 취소 3회 → 최종 status=CANCELED', async () => {
      const { paymentKey } = await createAndConfirmPayment('PARTIAL-001', 30000);

      // 1차 부분 취소: 10000원
      const res1 = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '1차 부분 취소', cancelAmount: 10000 })
        .expect(200);
      expect((res1.body as { data: { status: string } }).data.status).toBe(PG_PAYMENT_STATUS.PARTIAL_CANCELED);

      // 2차 부분 취소: 10000원
      const res2 = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '2차 부분 취소', cancelAmount: 10000 })
        .expect(200);
      expect((res2.body as { data: { status: string } }).data.status).toBe(PG_PAYMENT_STATUS.PARTIAL_CANCELED);

      // 3차 부분 취소: 10000원 (누적 30000 = 전액) → CANCELED
      const res3 = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '3차 부분 취소 (전액)', cancelAmount: 10000 })
        .expect(200);
      expect((res3.body as { data: { status: string } }).data.status).toBe(PG_PAYMENT_STATUS.CANCELED);
    });
  });

  // ============================================================
  // 시나리오 C: 취소 에러 케이스
  // ============================================================
  describe('시나리오 C: 취소 에러 케이스', () => {
    // TC-CANCEL-04: 누적 취소 금액 초과 → 400 (PGW_007)
    it('TC-CANCEL-04: 누적 취소 금액 초과 → 400 (PGW_007)', async () => {
      const { paymentKey } = await createAndConfirmPayment('OVER-001', 10000);

      // 1차 부분 취소: 7000원 → 성공
      await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '부분 취소', cancelAmount: 7000 })
        .expect(200);

      // 2차 부분 취소: 5000원 (7000+5000=12000 > 10000) → 초과
      const res = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: '초과 취소', cancelAmount: 5000 })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_007);
    });

    // TC-CANCEL-05: READY 상태 주문 취소 시도 → 400 (TXN_003)
    it('TC-CANCEL-05: READY 상태 주문 취소 → 400 (TXN_003)', async () => {
      // 주문만 생성 (승인 없음)
      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId: 'TC-C05-ORDER-001', amount: 10000, orderName: 'READY취소테스트' })
        .expect(201);
      const paymentKey = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      const res = await pgRequest(server, 'post', `/pg/v1/payments/${paymentKey}/cancel`, secretKey)
        .send({ cancelReason: 'READY 상태 취소' })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.TXN_003);
    });

    // TC-CANCEL-06: 존재하지 않는 paymentKey 취소 → 404 (TXN_001)
    it('TC-CANCEL-06: 존재하지 않는 paymentKey 취소 → 404 (TXN_001)', async () => {
      const fakeKey = '00000000-0000-0000-0000-000000000000';

      const res = await pgRequest(server, 'post', `/pg/v1/payments/${fakeKey}/cancel`, secretKey)
        .send({ cancelReason: '없는 결제 취소' })
        .expect(404);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.TXN_001);
    });
  });
});
