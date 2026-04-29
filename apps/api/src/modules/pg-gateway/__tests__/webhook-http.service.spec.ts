// ============================================================
// WebhookHttpService 단위 테스트
// fetch + AbortController 타임아웃 + 응답 타입 분기 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookHttpService } from '../services/webhook-http.service';

// ---- fetch Mock ----
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const WEBHOOK_URL = 'https://merchant.example.com/webhook';
const BODY = JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED' });
const SIGNATURE = 'abc123def456';
const WEBHOOK_ID = 'wh-uuid-1';

// ============================================================
describe('WebhookHttpService', () => {
  let service: WebhookHttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookHttpService],
    }).compile();

    service = module.get<WebhookHttpService>(WebhookHttpService);
    jest.clearAllMocks();
  });

  // ── TC-H1: 200 OK 응답 → { ok: true, status: 200, body } ──
  it('TC-H1: 200 응답 → ok:true, status:200, body 포함', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });

    const result = await service.post(WEBHOOK_URL, BODY, SIGNATURE, WEBHOOK_ID);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBe('OK');
    expect(result.error).toBeUndefined();
  });

  // ── TC-H2: 500 응답 → { ok: false, status: 500, body } ──
  it('TC-H2: 500 응답 → ok:false, status:500, body 포함', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await service.post(WEBHOOK_URL, BODY, SIGNATURE, WEBHOOK_ID);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.body).toBe('Internal Server Error');
    expect(result.error).toBeUndefined();
  });

  // ── TC-H3: fetch 예외 발생 → { ok: false, status: null, error } ──
  it('TC-H3: fetch 네트워크 에러 → ok:false, status:null, error 포함', async () => {
    mockFetch.mockRejectedValue(new Error('AbortError: The operation was aborted'));

    const result = await service.post(WEBHOOK_URL, BODY, SIGNATURE, WEBHOOK_ID);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe('AbortError: The operation was aborted');
  });

  // ── TC-H4: 올바른 헤더 전송 검증 ──
  it('TC-H4: X-Webhook-Signature + X-Webhook-Id 헤더 포함하여 POST 전송', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    });

    await service.post(WEBHOOK_URL, BODY, SIGNATURE, WEBHOOK_ID);

    expect(mockFetch).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Signature': SIGNATURE,
          'X-Webhook-Id': WEBHOOK_ID,
        }),
        body: BODY,
      }),
    );
  });

  // ── TC-H5: 비-Error 예외 처리 ──
  it('TC-H5: Error 인스턴스가 아닌 예외 → "Unknown error" 반환', async () => {
    mockFetch.mockRejectedValue('string-error');

    const result = await service.post(WEBHOOK_URL, BODY, SIGNATURE, WEBHOOK_ID);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe('Unknown error');
  });
});
