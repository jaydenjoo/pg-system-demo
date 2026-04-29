// ============================================================
// Phase 8 — PG Gateway E2E 통합 테스트
// 결제 정상 흐름 + 인증 실패 + 금액 변조 + Mock 카드사 실패 + 가상계좌
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
describe('PG Gateway E2E', () => {
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
        company_name: 'E2E테스트회사_PGW',
        business_no: '8880010001',
        representative: 'PG테스트대표',
        business_type: '법인',
      },
    });

    // 2. 대리점 생성
    const agent = await prisma.agents.create({
      data: {
        company_id: company.id,
        agent_code: 'E2EPGWAGT01',
        agent_name: 'E2E PGW 테스트대리점',
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
        merchant_code: 'E2EPGWMRC01',
        merchant_name: 'E2E PGW 테스트가맹점',
        status: 'ACTIVE',
        settlement_cycle: 'D+2',
      },
    });
    merchantId = merchant.id;

    // 4. API 키 발급 (JWT 관리자 API)
    const apiKeyRes = await authenticatedRequest(server, 'post', '/pg/v1/api-keys', adminToken)
      .send({ merchantId })
      .expect(201);

    secretKey = (apiKeyRes.body as { data: { secretKey: string } }).data.secretKey;
  });

  afterAll(async () => {
    await cleanupTestData(prisma);
    await closeTestApp(app);
  });

  // ============================================================
  // 시나리오 1: 카드 결제 정상 흐름
  // ============================================================
  describe('시나리오 1: 카드 결제 정상 흐름', () => {
    let paymentKey: string;
    const orderId = 'TC-S1-ORDER-001';
    const amount = 10000;

    // TC-E2E-01: 결제 주문 생성 → 201, paymentKey 반환
    it('TC-E2E-01: 결제 주문 생성 → 201, status=READY, paymentKey 반환', async () => {
      const res = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId, amount, orderName: '테스트상품' })
        .expect(201);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.status).toBe(PG_PAYMENT_STATUS.READY);
      expect(typeof data.paymentKey).toBe('string');
      expect(data.amount).toBe(amount);
      paymentKey = data.paymentKey as string;
    });

    // TC-E2E-02: orderId로 주문 조회 → paymentKey 일치
    it('TC-E2E-02: orderId로 주문 조회 → paymentKey 일치, status=READY', async () => {
      const res = await pgRequest(server, 'get', `/pg/v1/payments/orders/${orderId}`, secretKey)
        .expect(200);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.paymentKey).toBe(paymentKey);
      expect(data.status).toBe(PG_PAYMENT_STATUS.READY);
      expect(data.amount).toBe(amount);
    });

    // TC-E2E-03: paymentKey로 결제 승인 → DONE
    it('TC-E2E-03: paymentKey로 결제 승인 → status=DONE, approvedAt 존재, card 정보 포함', async () => {
      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey, orderId, amount })
        .expect(200);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.status).toBe(PG_PAYMENT_STATUS.DONE);
      expect(data.approvedAt).toBeDefined();
      expect(data.card).toBeDefined();
    });

    // TC-E2E-04: 승인 후 paymentKey 조회 → 상태 DONE 확인
    it('TC-E2E-04: 승인 후 paymentKey로 조회 → status=DONE 확인', async () => {
      const res = await pgRequest(server, 'get', `/pg/v1/payments/${paymentKey}`, secretKey)
        .expect(200);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.status).toBe(PG_PAYMENT_STATUS.DONE);
      expect(data.amount).toBe(amount);
    });
  });

  // ============================================================
  // 시나리오 2: 인증 실패
  // ============================================================
  describe('시나리오 2: 인증 실패', () => {
    // TC-E2E-05: 잘못된 secretKey → 401
    it('TC-E2E-05: 잘못된 secretKey → 401', async () => {
      await pgRequest(server, 'post', '/pg/v1/payments', 'wrong-key-00000000')
        .send({ orderId: 'TC-S2-ORDER-001', amount: 10000, orderName: '인증실패테스트' })
        .expect(401);
    });

    // TC-E2E-06: 인증 헤더 없음 → 401
    it('TC-E2E-06: 인증 헤더 없음 → 401', async () => {
      await request(server)
        .post('/pg/v1/payments')
        .send({ orderId: 'TC-S2-ORDER-002', amount: 10000, orderName: '인증없음테스트' })
        .expect(401);
    });

    // TC-E2E-07: 만료/비활성 API 키 → 401
    it('TC-E2E-07: 폐기된 API 키 → 401', async () => {
      // 별도 API 키 발급 후 폐기
      const apiKeyRes = await authenticatedRequest(server, 'post', '/pg/v1/api-keys', adminToken)
        .send({ merchantId })
        .expect(201);

      const { secretKey: tempSecret, clientKey } = (
        apiKeyRes.body as { data: { secretKey: string; clientKey: string } }
      ).data;

      // 목록에서 id 조회 후 폐기
      const listRes = await authenticatedRequest(server, 'get', `/pg/v1/api-keys?merchantId=${merchantId}`, adminToken)
        .expect(200);

      const keys = (listRes.body as { data: Array<{ id: string; client_key: string }> }).data;
      const tempKey = keys.find((k) => k.client_key === clientKey);
      if (tempKey) {
        await authenticatedRequest(server, 'delete', `/pg/v1/api-keys/${tempKey.id}?merchantId=${merchantId}`, adminToken)
          .expect(204);
      }

      // 폐기된 키로 결제 요청 → 401
      await pgRequest(server, 'post', '/pg/v1/payments', tempSecret)
        .send({ orderId: 'TC-S2-ORDER-003', amount: 10000, orderName: '폐기키테스트' })
        .expect(401);
    });
  });

  // ============================================================
  // 시나리오 3: 금액 변조 거절
  // ============================================================
  describe('시나리오 3: 금액 변조 거절', () => {
    let donePaymentKey: string;

    beforeAll(async () => {
      // TC-E2E-09를 위해 DONE 상태 결제 미리 준비
      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId: 'TC-S3-ORDER-PRE', amount: 10000, orderName: '중복승인사전준비' })
        .expect(201);
      donePaymentKey = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: donePaymentKey, orderId: 'TC-S3-ORDER-PRE', amount: 10000 })
        .expect(200);
    });

    // TC-E2E-08: 승인 시 금액 불일치 → 400 (PGW_002)
    it('TC-E2E-08: 승인 시 금액 불일치 → 400 (PGW_002)', async () => {
      // 새 주문 생성 (amount=10000)
      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId: 'TC-S3-ORDER-001', amount: 10000, orderName: '금액불일치테스트' })
        .expect(201);
      const pk = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      // 금액 9999로 승인 요청 → 400
      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: pk, orderId: 'TC-S3-ORDER-001', amount: 9999 })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_002);
    });

    // TC-E2E-09: 중복 승인 방지 → 400 (PGW_003)
    it('TC-E2E-09: 이미 DONE 상태 주문 재승인 → 400 (PGW_003)', async () => {
      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: donePaymentKey, orderId: 'TC-S3-ORDER-PRE', amount: 10000 })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_003);
    });
  });

  // ============================================================
  // 시나리오 4: Mock 카드사 실패 패턴
  // amount % 100 === 99 → 카드 거절(ACQ_001)
  // amount % 100 === 98 → 타임아웃(ACQ_002)
  // amount % 100 === 97 → 잔액 부족(ACQ_003)
  // 모두 UnprocessableEntityException (422) + PGW_005
  // ============================================================
  describe('시나리오 4: Mock 카드사 실패 패턴', () => {
    // TC-E2E-10: amount 끝 99 → 카드 거절 (PGW_005, 422)
    it('TC-E2E-10: amount 끝 99 → 카드 거절 → 422 (PGW_005), status=ABORTED', async () => {
      const amount = 10099; // 99로 끝남 → 거절
      const orderId = 'TC-S4-ORDER-001';

      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId, amount, orderName: '카드거절테스트' })
        .expect(201);
      const pk = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: pk, orderId, amount })
        .expect(422);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_005);
    });

    // TC-E2E-11: amount 끝 98 → 타임아웃 (PGW_005, 422)
    it('TC-E2E-11: amount 끝 98 → 타임아웃 → 422 (PGW_005), status=ABORTED', async () => {
      const amount = 10098; // 98로 끝남 → 타임아웃
      const orderId = 'TC-S4-ORDER-002';

      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId, amount, orderName: '타임아웃테스트' })
        .expect(201);
      const pk = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: pk, orderId, amount })
        .expect(422);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_005);
    });

    // TC-E2E-12: amount 끝 97 → 잔액 부족 (PGW_005, 422)
    it('TC-E2E-12: amount 끝 97 → 잔액 부족 → 422 (PGW_005), status=ABORTED', async () => {
      const amount = 10097; // 97로 끝남 → 잔액 부족
      const orderId = 'TC-S4-ORDER-003';

      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId, amount, orderName: '잔액부족테스트' })
        .expect(201);
      const pk = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      const res = await pgRequest(server, 'post', '/pg/v1/payments/confirm', secretKey)
        .send({ paymentKey: pk, orderId, amount })
        .expect(422);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_005);
    });
  });

  // ============================================================
  // 시나리오 5: 가상계좌 흐름
  // ============================================================
  describe('시나리오 5: 가상계좌 흐름', () => {
    let vaPaymentKey: string;
    let vaAccountNumber: string;

    // TC-E2E-13: 가상계좌 발급 → WAITING_FOR_DEPOSIT
    it('TC-E2E-13: 가상계좌 발급 → status=WAITING_FOR_DEPOSIT, accountNumber 존재', async () => {
      // 1) 주문 생성
      const orderRes = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId: 'TC-S5-VA-001', amount: 20000, orderName: '가상계좌테스트' })
        .expect(201);
      vaPaymentKey = (orderRes.body as { data: { paymentKey: string } }).data.paymentKey;

      // 2) 가상계좌 발급
      const vaRes = await pgRequest(server, 'post', '/pg/v1/virtual-account/confirm', secretKey)
        .send({ paymentKey: vaPaymentKey, orderId: 'TC-S5-VA-001', amount: 20000 })
        .expect(200);

      const data = (vaRes.body as { data: Record<string, unknown> }).data;
      expect(data.status).toBe(PG_PAYMENT_STATUS.WAITING_FOR_DEPOSIT);
      expect(data.virtualAccount).toBeDefined();
      vaAccountNumber = ((data.virtualAccount as Record<string, unknown>).accountNumber) as string;
      expect(vaAccountNumber).toBeDefined();
    });

    // TC-E2E-14: 입금 콜백 → { ok: true }, 상태 DONE
    it('TC-E2E-14: 입금 콜백 → ok:true, 이후 status=DONE 확인', async () => {
      // 인증 없이 deposit-callback 호출
      const cbRes = await request(server)
        .post('/pg/v1/virtual-account/deposit-callback')
        .send({
          accountNumber: vaAccountNumber,
          amount: 20000,
          depositorName: '홍길동',
          bankCode: '088',
        })
        .expect(200);

      const cbData = (cbRes.body as { data: { ok: boolean } }).data;
      expect(cbData.ok).toBe(true);

      // 상태 DONE 확인
      const checkRes = await pgRequest(server, 'get', `/pg/v1/payments/${vaPaymentKey}`, secretKey)
        .expect(200);
      expect((checkRes.body as { data: { status: string } }).data.status).toBe(PG_PAYMENT_STATUS.DONE);
    });

    // TC-E2E-15: 미존재 accountNumber 콜백 → 404 (PGW_008)
    it('TC-E2E-15: 미존재 accountNumber 콜백 → 404 (PGW_008)', async () => {
      const res = await request(server)
        .post('/pg/v1/virtual-account/deposit-callback')
        .send({
          accountNumber: 'NONEXISTENT-ACCOUNT-999',
          amount: 20000,
          depositorName: '홍길동',
          bankCode: '088',
        })
        .expect(404);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_008);
    });

    // TC-E2E-16: 입금 금액 불일치 콜백 → 400 (PGW_002)
    it('TC-E2E-16: 입금 금액 불일치 콜백 → 400 (PGW_002)', async () => {
      // TC-E2E-14에서 이미 소진됨 → 새 가상계좌 발급
      const orderRes2 = await pgRequest(server, 'post', '/pg/v1/payments', secretKey)
        .send({ orderId: 'TC-S5-VA-002', amount: 20000, orderName: '금액불일치가상계좌' })
        .expect(201);
      const pk2 = (orderRes2.body as { data: { paymentKey: string } }).data.paymentKey;

      const vaRes2 = await pgRequest(server, 'post', '/pg/v1/virtual-account/confirm', secretKey)
        .send({ paymentKey: pk2, orderId: 'TC-S5-VA-002', amount: 20000 })
        .expect(200);
      const accountNumber2 = (
        (vaRes2.body as { data: { virtualAccount: { accountNumber: string } } }).data.virtualAccount
      ).accountNumber;

      // 5000원으로 입금 (20000원과 불일치)
      const res = await request(server)
        .post('/pg/v1/virtual-account/deposit-callback')
        .send({
          accountNumber: accountNumber2,
          amount: 5000,
          depositorName: '홍길동',
          bankCode: '088',
        })
        .expect(400);

      expect((res.body as Record<string, unknown>).code).toBe(ERROR_CODES.PGW_002);
    });
  });
});
