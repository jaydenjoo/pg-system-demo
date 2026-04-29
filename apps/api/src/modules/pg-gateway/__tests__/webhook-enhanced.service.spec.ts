// ============================================================
// B-2 테스트 — sendTest / resend / listEvents 필터 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from '../services/webhook.service';
import { WebhookCryptoService } from '../services/webhook-crypto.service';
import { WebhookHttpService } from '../services/webhook-http.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WEBHOOK_STATUS } from '@pg-system/shared';

// ---- 시크릿 픽스처 ----
const PLAIN_SECRET = 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const ENCRYPTED_HEX = Buffer.from('encrypted-' + PLAIN_SECRET).toString('hex');

const mockWebhookCrypto = {
  encryptSecret: jest.fn().mockResolvedValue(ENCRYPTED_HEX),
  decryptSecret: jest.fn().mockResolvedValue(PLAIN_SECRET),
  generateSignature: jest.fn().mockReturnValue('sig_test'),
};

const mockWebhookHttp = {
  post: jest.fn(),
};

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
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('WebhookService — B-2 Enhanced', () => {
  let service: WebhookService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookCryptoService, useValue: mockWebhookCrypto },
        { provide: WebhookHttpService, useValue: mockWebhookHttp },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  // ================================================
  // sendTest
  // ================================================
  describe('sendTest', () => {
    it('URL 미설정 시 실패 반환', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: null,
        webhook_secret: null,
      });

      const result = await service.sendTest('key-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('URL');
      expect(mockWebhookHttp.post).not.toHaveBeenCalled();
    });

    it('Secret 미설정 시 실패 반환', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: null,
      });

      const result = await service.sendTest('key-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Secret');
    });

    it('HTTP 성공 시 success=true + statusCode 반환', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: ENCRYPTED_HEX,
      });
      mockWebhookHttp.post.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'OK',
      });

      const result = await service.sendTest('key-1');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toBeNull();
    });

    it('HTTP 실패 시 success=false + 에러 메시지', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: ENCRYPTED_HEX,
      });
      mockWebhookHttp.post.mockResolvedValue({
        ok: false,
        error: 'Connection timeout',
      });

      const result = await service.sendTest('key-1');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.message).toBe('Connection timeout');
    });

    it('DB에 레코드를 저장하지 않음', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: ENCRYPTED_HEX,
      });
      mockWebhookHttp.post.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'OK',
      });

      await service.sendTest('key-1');

      expect(mockPrisma.pg_webhooks.create).not.toHaveBeenCalled();
    });
  });

  // ================================================
  // resend
  // ================================================
  describe('resend', () => {
    const baseWebhook = {
      id: 'wh-1',
      status: WEBHOOK_STATUS.FAILED,
      payload: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        createdAt: '2026-03-01T00:00:00Z',
        data: {
          paymentKey: 'pk-1',
          orderId: 'ord-1',
          status: 'DONE',
          amount: 10000,
        },
      },
      retry_count: 3,
      pg_payment_orders: {
        id: 'order-1',
        merchant_id: 'merchant-1',
        api_key_id: 'key-1',
      },
    };

    it('존재하지 않는 webhookId → 실패', async () => {
      mockPrisma.pg_webhooks.findFirst.mockResolvedValue(null);

      const result = await service.resend('non-exist', 'merchant-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('찾을 수 없습니다');
    });

    it('다른 merchantId → 실패 (격리)', async () => {
      mockPrisma.pg_webhooks.findFirst.mockResolvedValue(baseWebhook);

      const result = await service.resend('wh-1', 'wrong-merchant');

      expect(result.success).toBe(false);
      expect(result.message).toContain('찾을 수 없습니다');
    });

    it('SENT 상태 → 재발송 거부', async () => {
      mockPrisma.pg_webhooks.findFirst.mockResolvedValue({
        ...baseWebhook,
        status: WEBHOOK_STATUS.SENT,
      });

      const result = await service.resend('wh-1', 'merchant-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('FAILED 상태만');
    });

    it('FAILED → 재발송 성공 시 SENT로 업데이트', async () => {
      mockPrisma.pg_webhooks.findFirst.mockResolvedValue(baseWebhook);
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: ENCRYPTED_HEX,
      });
      mockWebhookHttp.post.mockResolvedValue({
        ok: true,
        status: 200,
        body: 'OK',
      });

      const result = await service.resend('wh-1', 'merchant-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('재발송 성공');
      expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({
            status: WEBHOOK_STATUS.SENT,
          }),
        }),
      );
    });

    it('FAILED → 재발송 실패 시 상태 FAILED 유지', async () => {
      mockPrisma.pg_webhooks.findFirst.mockResolvedValue(baseWebhook);
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue({
        id: 'key-1',
        webhook_url: 'https://example.com/webhook',
        webhook_secret: ENCRYPTED_HEX,
      });
      mockWebhookHttp.post.mockResolvedValue({
        ok: false,
        status: 500,
        body: 'Internal Server Error',
      });

      const result = await service.resend('wh-1', 'merchant-1');

      expect(result.success).toBe(false);
      // status는 업데이트하지 않음 (FAILED 유지)
      expect(mockPrisma.pg_webhooks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            status: expect.anything(),
          }),
        }),
      );
    });
  });

  // ================================================
  // listEvents (필터)
  // ================================================
  describe('listEvents with filters', () => {
    const mockEvents = [
      {
        id: 'wh-1',
        event_type: 'PAYMENT_STATUS_CHANGED',
        status: WEBHOOK_STATUS.SENT,
        retry_count: 0,
        sent_at: new Date(),
        response_status: 200,
        created_at: new Date(),
      },
    ];

    beforeEach(() => {
      mockPrisma.pg_webhooks.findMany.mockResolvedValue(mockEvents);
    });

    it('필터 없이 호출 시 merchantId만 where 조건', async () => {
      await service.listEvents('merchant-1', 20);

      expect(mockPrisma.pg_webhooks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pg_payment_orders: { merchant_id: 'merchant-1' },
          },
        }),
      );
    });

    it('status 필터 적용', async () => {
      await service.listEvents('merchant-1', 20, {
        status: WEBHOOK_STATUS.FAILED,
      });

      expect(mockPrisma.pg_webhooks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: WEBHOOK_STATUS.FAILED,
          }),
        }),
      );
    });

    it('날짜 필터 적용', async () => {
      await service.listEvents('merchant-1', 20, {
        startDate: '2026-03-01T00:00:00Z',
        endDate: '2026-03-31T23:59:59Z',
      });

      const call = mockPrisma.pg_webhooks.findMany.mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
      expect(call.where.created_at.gte).toBeInstanceOf(Date);
      expect(call.where.created_at.lte).toBeInstanceOf(Date);
    });

    it('status + 날짜 복합 필터', async () => {
      await service.listEvents('merchant-1', 10, {
        status: WEBHOOK_STATUS.SENT,
        startDate: '2026-03-01T00:00:00Z',
      });

      const call = mockPrisma.pg_webhooks.findMany.mock.calls[0][0];
      expect(call.where.status).toBe(WEBHOOK_STATUS.SENT);
      expect(call.where.created_at).toBeDefined();
      expect(call.take).toBe(10);
    });
  });
});
