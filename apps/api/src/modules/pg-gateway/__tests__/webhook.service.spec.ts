// ============================================================
// Phase 5 테스트 — 웹훅 서비스 전체 검증
// SRP 분리 후: WebhookCryptoService + WebhookHttpService mock 사용
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { WebhookService } from '../services/webhook.service';
import { WebhookCryptoService } from '../services/webhook-crypto.service';
import { WebhookHttpService } from '../services/webhook-http.service';
import { WebhookRetryService } from '../services/webhook-retry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WEBHOOK_STATUS } from '@pg-system/shared';

// ---- 시크릿 픽스처 ----
const PLAIN_SECRET = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const ENCRYPTED_HEX = Buffer.from('encrypted-' + PLAIN_SECRET).toString('hex');

// ---- WebhookCryptoService Mock ----
// generateSignature는 실제 HMAC 구현 유지 → TC-6 서명 값 검증 가능
const mockWebhookCrypto = {
  encryptSecret: jest.fn().mockResolvedValue(ENCRYPTED_HEX),
  decryptSecret: jest.fn().mockResolvedValue(PLAIN_SECRET),
  generateSignature: jest.fn().mockImplementation(
    (body: string, secret: string) =>
      crypto.createHmac('sha256', secret).update(body).digest('hex'),
  ),
};

// ---- WebhookHttpService Mock ----
const mockWebhookHttp = {
  post: jest.fn(),
};

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: { findFirst: jest.fn() },
  pg_api_keys: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  pg_webhooks: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

// ---- HTTP 결과 헬퍼 ----
const makeHttpOk = () => ({ ok: true as const, status: 200, body: 'OK' });
const makeHttp500 = () => ({
  ok: false as const,
  status: 500,
  body: 'Internal Server Error',
});
const makeHttpError = (msg: string) => ({
  ok: false as const,
  status: null,
  body: msg,
  error: msg,
});

// ---- 픽스처 ----
const MERCHANT_ID = 'merchant-uuid-1';
const PAYMENT_ORDER_ID = 'order-uuid-1';
const API_KEY_ID = 'key-id-1';
const WEBHOOK_URL = 'https://merchant.example.com/webhook';
const WEBHOOK_ID = 'wh-uuid-1';

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ORDER_ID,
  payment_key: 'pk-uuid-1',
  order_id: 'ORDER-2024-001',
  merchant_id: MERCHANT_ID,
  status: 'DONE',
  amount: 10000n,
  approved_at: new Date('2024-01-01T12:00:00Z'),
  cancel_amount: null,
  cancel_reason: null,
  api_key_id: API_KEY_ID,
  payment_method: 'CARD',
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeApiKey = (overrides: Record<string, unknown> = {}) => ({
  id: API_KEY_ID,
  merchant_id: MERCHANT_ID,
  webhook_url: WEBHOOK_URL,
  webhook_secret: ENCRYPTED_HEX,
  ...overrides,
});

const makeWebhookRecord = (overrides: Record<string, unknown> = {}) => ({
  id: WEBHOOK_ID,
  payment_order_id: PAYMENT_ORDER_ID,
  event_type: 'PAYMENT_STATUS_CHANGED',
  payload: {
    eventType: 'PAYMENT_STATUS_CHANGED',
    createdAt: '2024-01-01T12:00:00.000Z',
    data: {
      paymentKey: 'pk-uuid-1',
      orderId: 'ORDER-2024-001',
      status: 'DONE',
      amount: 10000,
    },
  },
  status: 'PENDING',
  retry_count: 0,
  next_retry_at: null,
  sent_at: null,
  response_status: null,
  response_body: null,
  created_at: new Date(),
  ...overrides,
});

/** retryPending용 — include된 pg_payment_orders 관계 포함 */
const makeWebhookWithOrder = (overrides: Record<string, unknown> = {}) => ({
  ...makeWebhookRecord(overrides),
  pg_payment_orders: {
    id: PAYMENT_ORDER_ID,
    api_key_id: API_KEY_ID,
  },
});

// ============================================================
// WebhookService 테스트
// ============================================================
describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookCryptoService, useValue: mockWebhookCrypto },
        { provide: WebhookHttpService, useValue: mockWebhookHttp },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    jest.clearAllMocks();

    // 기본 동작 복원
    mockWebhookCrypto.decryptSecret.mockResolvedValue(PLAIN_SECRET);
    mockWebhookCrypto.encryptSecret.mockResolvedValue(ENCRYPTED_HEX);
    mockWebhookCrypto.generateSignature.mockImplementation(
      (body: string, secret: string) =>
        crypto.createHmac('sha256', secret).update(body).digest('hex'),
    );
  });

  // ── TC-1: 정상 전송 (200 응답) ──
  it('webhook_url + 200 응답 → SENT 상태', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create.mockResolvedValue(makeWebhookRecord());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ status: WEBHOOK_STATUS.SENT }),
    );
    mockWebhookHttp.post.mockResolvedValue(makeHttpOk());

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    // decryptSecret 호출 확인
    expect(mockWebhookCrypto.decryptSecret).toHaveBeenCalledWith(ENCRYPTED_HEX);

    // pg_webhooks 레코드가 SENT로 업데이트됨
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WEBHOOK_ID },
        data: expect.objectContaining({
          status: WEBHOOK_STATUS.SENT,
        }),
      }),
    );
  });

  // ── TC-2: webhook_url 미설정 (null) ──
  it('webhook_url이 null이면 에러 없이 skip', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(
      makeApiKey({ webhook_url: null }),
    );

    await expect(
      service.dispatch(
        PAYMENT_ORDER_ID,
        MERCHANT_ID,
        'PAYMENT_STATUS_CHANGED',
      ),
    ).resolves.toBeUndefined();

    expect(mockPrisma.pg_webhooks.create).not.toHaveBeenCalled();
    expect(mockWebhookHttp.post).not.toHaveBeenCalled();
  });

  // ── TC-3: webhook_secret 미설정 (null) ──
  it('webhook_secret이 null이면 에러 없이 skip', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(
      makeApiKey({ webhook_secret: null }),
    );

    await expect(
      service.dispatch(
        PAYMENT_ORDER_ID,
        MERCHANT_ID,
        'PAYMENT_STATUS_CHANGED',
      ),
    ).resolves.toBeUndefined();

    expect(mockPrisma.pg_webhooks.create).not.toHaveBeenCalled();
  });

  // ── TC-4: HTTP 500 응답 → 재시도 예약 ──
  it('HTTP 500 → PENDING 유지 + retry_count=1 + next_retry_at 존재', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create.mockResolvedValue(makeWebhookRecord());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ retry_count: 1 }),
    );
    mockWebhookHttp.post.mockResolvedValue(makeHttp500());

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WEBHOOK_ID },
        data: expect.objectContaining({
          retry_count: 1,
          next_retry_at: expect.any(Date),
          response_status: 500,
        }),
      }),
    );
  });

  // ── TC-5: 네트워크 타임아웃 → error 필드 결과 ──
  it('HTTP 에러 결과 → scheduleRetry 호출 (retry_count=1)', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create.mockResolvedValue(makeWebhookRecord());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ retry_count: 1 }),
    );
    mockWebhookHttp.post.mockResolvedValue(
      makeHttpError('AbortError: The operation was aborted'),
    );

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WEBHOOK_ID },
        data: expect.objectContaining({
          retry_count: 1,
          response_status: null,
        }),
      }),
    );
  });

  // ── TC-6: HMAC 서명 검증 (복호화된 secret 기준) ──
  it('webhookHttp.post 호출 시 올바른 HMAC 서명 전달', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create.mockResolvedValue(makeWebhookRecord());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ status: WEBHOOK_STATUS.SENT }),
    );
    mockWebhookHttp.post.mockResolvedValue(makeHttpOk());

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    // post(url, body, signature, webhookId) 호출 검증
    expect(mockWebhookHttp.post).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.any(String), // body
      expect.any(String), // signature
      WEBHOOK_ID,
    );

    // 서명 값 직접 검증 — 복호화된 PLAIN_SECRET 기준
    const [, calledBody, calledSignature] = mockWebhookHttp.post.mock
      .calls[0] as [string, string, string, string];
    const expectedSignature = crypto
      .createHmac('sha256', PLAIN_SECRET)
      .update(calledBody)
      .digest('hex');

    expect(calledSignature).toBe(expectedSignature);
  });

  // ── TC-7: 최대 재시도 초과 (8번째) → FAILED ──
  it('retry_count가 MAX_RETRIES 초과 → FAILED 상태', async () => {
    const whRecord = makeWebhookWithOrder({
      retry_count: 7,
      next_retry_at: new Date(Date.now() - 1000),
    });

    mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
    mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
    mockWebhookHttp.post.mockResolvedValue(makeHttp500());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ status: WEBHOOK_STATUS.FAILED }),
    );

    const result = await service.retryPending();

    // retry_count 7 → 8 → MAX_RETRIES(7) 초과 → FAILED
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WEBHOOK_STATUS.FAILED,
          retry_count: 8,
        }),
      }),
    );
    expect(result.failed).toBe(1);
  });

  // ── TC-8: 지수 백오프 시간 계산 ──
  it('지수 백오프: retry=0→1분, retry=1→2분, retry=2→4분', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const testCases = [
      { retryCount: 0, expectedDelayMs: 60_000 },
      { retryCount: 1, expectedDelayMs: 120_000 },
      { retryCount: 2, expectedDelayMs: 240_000 },
    ];

    for (const tc of testCases) {
      jest.clearAllMocks();
      mockWebhookCrypto.decryptSecret.mockResolvedValue(PLAIN_SECRET);
      mockWebhookCrypto.generateSignature.mockImplementation(
        (body: string, secret: string) =>
          crypto.createHmac('sha256', secret).update(body).digest('hex'),
      );

      const whRecord = makeWebhookWithOrder({
        retry_count: tc.retryCount,
        next_retry_at: new Date(now - 1000),
      });

      mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
      mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
      mockWebhookHttp.post.mockResolvedValue(makeHttp500());
      mockPrisma.pg_webhooks.update.mockResolvedValue(whRecord);

      await service.retryPending();

      const updateCall = mockPrisma.pg_webhooks.update.mock.calls[0] as [
        { where: { id: string }; data: { next_retry_at: Date } },
      ];
      const nextRetryAt = updateCall[0].data.next_retry_at;

      expect(nextRetryAt.getTime()).toBe(now + tc.expectedDelayMs);
    }

    jest.restoreAllMocks();
  });

  // ── TC-9: 멱등성 — 동일 paymentOrderId 중복 dispatch ──
  it('동일 paymentOrderId 2번 dispatch → 각각 별도 webhook 레코드 생성', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(makeOrder());
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create
      .mockResolvedValueOnce(makeWebhookRecord({ id: 'wh-1' }))
      .mockResolvedValueOnce(makeWebhookRecord({ id: 'wh-2' }));
    mockPrisma.pg_webhooks.update.mockResolvedValue({});
    mockWebhookHttp.post.mockResolvedValue(makeHttpOk());

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );
    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    expect(mockPrisma.pg_webhooks.create).toHaveBeenCalledTimes(2);
  });

  // ── TC-10: payload 구조 검증 ──
  it('WebhookPayload 형식 일치 (eventType, data.paymentKey 등)', async () => {
    const order = makeOrder();
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(order);
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
    mockPrisma.pg_webhooks.create.mockResolvedValue(makeWebhookRecord());
    mockPrisma.pg_webhooks.update.mockResolvedValue({});
    mockWebhookHttp.post.mockResolvedValue(makeHttpOk());

    await service.dispatch(
      PAYMENT_ORDER_ID,
      MERCHANT_ID,
      'PAYMENT_STATUS_CHANGED',
    );

    // pg_webhooks.create에 전달된 payload 검증
    const createCall = mockPrisma.pg_webhooks.create.mock.calls[0] as [
      { data: { payload: Record<string, unknown> } },
    ];
    const payload = createCall[0].data.payload as {
      eventType: string;
      createdAt: string;
      data: {
        paymentKey: string;
        orderId: string;
        status: string;
        amount: number;
        approvedAt: string;
      };
    };

    expect(payload.eventType).toBe('PAYMENT_STATUS_CHANGED');
    expect(payload.createdAt).toBeDefined();
    expect(payload.data.paymentKey).toBe('pk-uuid-1');
    expect(payload.data.orderId).toBe('ORDER-2024-001');
    expect(payload.data.status).toBe('DONE');
    expect(payload.data.amount).toBe(10000); // BigInt → number
    expect(payload.data.approvedAt).toBeDefined();
  });

  // ── TC-11: retryPending — 재전송 성공 ──
  it('retryPending — PENDING 웹훅 재전송 성공 → SENT', async () => {
    const whRecord = makeWebhookWithOrder({
      next_retry_at: new Date(Date.now() - 1000),
    });

    mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
    mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
    mockWebhookHttp.post.mockResolvedValue(makeHttpOk());
    mockPrisma.pg_webhooks.update.mockResolvedValue(
      makeWebhookRecord({ status: WEBHOOK_STATUS.SENT }),
    );

    const result = await service.retryPending();

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WEBHOOK_STATUS.SENT,
          sent_at: expect.any(Date),
        }),
      }),
    );
  });

  // ── TC-12: retryPending — 재전송 실패 → 재예약 ──
  it('retryPending — 재전송 실패 → retry_count 증가 + next_retry_at 갱신', async () => {
    const whRecord = makeWebhookWithOrder({
      retry_count: 2,
      next_retry_at: new Date(Date.now() - 1000),
    });

    mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
    mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
    mockWebhookHttp.post.mockResolvedValue(makeHttp500());
    mockPrisma.pg_webhooks.update.mockResolvedValue(whRecord);

    const result = await service.retryPending();

    expect(result.failed).toBe(1);
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retry_count: 3,
          next_retry_at: expect.any(Date),
        }),
      }),
    );
  });

  // ── TC-13: retryPending — 주문 없음 → FAILED ──
  it('retryPending — 주문 삭제된 경우 → FAILED 처리', async () => {
    const whRecord = {
      ...makeWebhookRecord({
        next_retry_at: new Date(Date.now() - 1000),
      }),
      pg_payment_orders: null,
    };

    mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
    mockPrisma.pg_webhooks.update.mockResolvedValue({});

    const result = await service.retryPending();

    expect(result.failed).toBe(1);
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WEBHOOK_STATUS.FAILED,
        }),
      }),
    );
  });

  // ── TC-14: 주문 조회 실패 (존재하지 않는 주문) ──
  it('dispatch — 존재하지 않는 paymentOrderId → 에러 없이 return', async () => {
    mockPrisma.pg_payment_orders.findFirst.mockResolvedValue(null);

    await expect(
      service.dispatch(
        'non-existent-id',
        MERCHANT_ID,
        'PAYMENT_STATUS_CHANGED',
      ),
    ).resolves.toBeUndefined();

    expect(mockPrisma.pg_api_keys.findFirst).not.toHaveBeenCalled();
  });

  // ── TC-15: updateConfig — secret 암호화 저장 ──
  it('updateConfig — encryptSecret 후 hex로 DB 저장', async () => {
    mockPrisma.pg_api_keys.update.mockResolvedValue(makeApiKey());

    const result = await service.updateConfig(
      API_KEY_ID,
      WEBHOOK_URL,
      PLAIN_SECRET,
    );

    expect(mockWebhookCrypto.encryptSecret).toHaveBeenCalledWith(PLAIN_SECRET);
    expect(mockPrisma.pg_api_keys.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: API_KEY_ID },
        data: expect.objectContaining({
          webhook_url: WEBHOOK_URL,
          webhook_secret: expect.any(String),
        }),
      }),
    );
    expect(result.webhookUrl).toBe(WEBHOOK_URL);
  });

  // ── TC-16: getConfig — secret 미노출 ──
  it('getConfig — webhookUrl과 hasWebhookSecret만 반환', async () => {
    mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());

    const result = await service.getConfig(API_KEY_ID);

    expect(result.webhookUrl).toBe(WEBHOOK_URL);
    expect(result.hasWebhookSecret).toBe(true);
  });

  // ── TC-17: retryPending — secret 복호화 실패 → FAILED ──
  it('retryPending — secret 복호화 실패 시 FAILED 처리', async () => {
    const whRecord = makeWebhookWithOrder({
      next_retry_at: new Date(Date.now() - 1000),
    });

    mockPrisma.pg_webhooks.findMany.mockResolvedValue([whRecord]);
    mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
    mockWebhookCrypto.decryptSecret.mockRejectedValue(
      new Error('KMS decrypt failed'),
    );
    mockPrisma.pg_webhooks.update.mockResolvedValue({});

    const result = await service.retryPending();

    expect(result.failed).toBe(1);
    expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WEBHOOK_STATUS.FAILED,
        }),
      }),
    );
  });
});

// ============================================================
// WebhookRetryService 테스트
// ============================================================
describe('WebhookRetryService', () => {
  let retryService: WebhookRetryService;
  let webhookService: WebhookService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        WebhookRetryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookCryptoService, useValue: mockWebhookCrypto },
        { provide: WebhookHttpService, useValue: mockWebhookHttp },
      ],
    }).compile();

    retryService = module.get<WebhookRetryService>(WebhookRetryService);
    webhookService = module.get<WebhookService>(WebhookService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    retryService.onModuleDestroy();
    jest.useRealTimers();
  });

  // ── TC-18: onModuleInit → setInterval 시작 ──
  it('onModuleInit 호출 시 30초 간격 스케줄러 시작', () => {
    const spy = jest.spyOn(webhookService, 'retryPending').mockResolvedValue({
      processed: 0,
      succeeded: 0,
      failed: 0,
    });

    retryService.onModuleInit();

    // 아직 호출 안 됨
    expect(spy).not.toHaveBeenCalled();

    // 30초 경과 → tick 호출
    jest.advanceTimersByTime(30_000);

    // setInterval → tick → retryPending 호출
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── TC-19: onModuleDestroy → clearInterval ──
  it('onModuleDestroy 호출 시 스케줄러 정지', () => {
    const spy = jest.spyOn(webhookService, 'retryPending').mockResolvedValue({
      processed: 0,
      succeeded: 0,
      failed: 0,
    });

    retryService.onModuleInit();
    retryService.onModuleDestroy();

    jest.advanceTimersByTime(60_000);

    // destroy 이후에는 호출되지 않아야 함
    expect(spy).not.toHaveBeenCalled();
  });
});
