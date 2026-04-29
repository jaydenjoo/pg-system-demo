import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// server-only 모듈 mock — vitest는 서버 컴포넌트 환경이 아니므로 빈 모듈로 대체
vi.mock('server-only', () => ({}));

import {
  createPaymentOrder,
  confirmPayment,
  getPayment,
  PgApiError,
} from '@/lib/payment-client';

// global fetch 모킹
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

const SECRET_KEY = 'test_sk_demo_1234';

// =============================================
// PgApiError
// =============================================
describe('PgApiError', () => {
  it('code, message, status 속성 보유', () => {
    const err = new PgApiError('PGW_NOT_FOUND', '결제 건 미존재', 404);
    expect(err.code).toBe('PGW_NOT_FOUND');
    expect(err.message).toBe('결제 건 미존재');
    expect(err.status).toBe(404);
    expect(err.name).toBe('PgApiError');
    expect(err).toBeInstanceOf(Error);
  });
});

// =============================================
// createPaymentOrder
// =============================================
describe('createPaymentOrder', () => {
  const input = {
    orderId: 'ORDER-001',
    amount: 10000,
    orderName: '테스트 상품',
    paymentMethod: 'CARD' as const,
  };

  it('성공 → PaymentOrderResponse 반환', async () => {
    const responseData = {
      paymentKey: 'pk-123',
      orderId: 'ORDER-001',
      orderName: '테스트 상품',
      status: 'READY',
      amount: 10000,
      paymentMethod: 'CARD',
      approvedAt: null,
      requestedAt: '2025-03-02T15:00:00.000Z',
    };
    mockFetch.mockResolvedValue(jsonResponse({ data: responseData }));

    const result = await createPaymentOrder(SECRET_KEY, input);

    expect(result).toEqual(responseData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/pg/v1/payments'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
  });

  it('Basic Auth 헤더가 Base64(secretKey:) 형식', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: {} }));

    await createPaymentOrder(SECRET_KEY, input);

    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    const authHeader = (callArgs[1].headers as Record<string, string>).Authorization;
    const expected = `Basic ${btoa(`${SECRET_KEY}:`)}`;
    expect(authHeader).toBe(expected);
  });

  it('400 에러 → PgApiError throw', async () => {
    const errorBody = { error: { code: 'PGW_INVALID_AMOUNT', message: '금액 불일치' } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 400));

    await expect(createPaymentOrder(SECRET_KEY, input)).rejects.toThrow(PgApiError);

    try {
      await createPaymentOrder(SECRET_KEY, input);
    } catch (e) {
      const err = e as PgApiError;
      expect(err.code).toBe('PGW_INVALID_AMOUNT');
      expect(err.message).toBe('금액 불일치');
      expect(err.status).toBe(400);
    }
  });

  it('401 에러 → PgApiError (인증 실패)', async () => {
    const errorBody = { error: { code: 'PGW_UNAUTHORIZED', message: '인증 실패' } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 401));

    await expect(createPaymentOrder(SECRET_KEY, input)).rejects.toThrow(PgApiError);
  });

  it('JSON 파싱 실패 → PG_UNKNOWN 코드', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
      headers: new Headers(),
    } as unknown as Response);

    try {
      await createPaymentOrder(SECRET_KEY, input);
    } catch (e) {
      const err = e as PgApiError;
      expect(err.code).toBe('PG_UNKNOWN');
      expect(err.status).toBe(500);
    }
  });
});

// =============================================
// confirmPayment
// =============================================
describe('confirmPayment', () => {
  const input = {
    paymentKey: 'pk-123',
    orderId: 'ORDER-001',
    amount: 10000,
    cardNumber: '4111111111111111',
    installmentMonths: 0,
  };

  it('성공 → 승인된 PaymentOrderResponse 반환', async () => {
    const responseData = {
      paymentKey: 'pk-123',
      orderId: 'ORDER-001',
      orderName: '테스트 상품',
      status: 'DONE',
      amount: 10000,
      paymentMethod: 'CARD',
      approvedAt: '2025-03-02T15:30:00.000Z',
      requestedAt: '2025-03-02T15:00:00.000Z',
    };
    mockFetch.mockResolvedValue(jsonResponse({ data: responseData }));

    const result = await confirmPayment(SECRET_KEY, input);

    expect(result).toEqual(responseData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/pg/v1/payments/confirm'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  });

  it('409 Conflict → PgApiError (이미 승인된 결제)', async () => {
    const errorBody = { error: { code: 'PGW_ALREADY_APPROVED', message: '이미 승인된 결제' } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 409));

    await expect(confirmPayment(SECRET_KEY, input)).rejects.toThrow(PgApiError);

    try {
      await confirmPayment(SECRET_KEY, input);
    } catch (e) {
      const err = e as PgApiError;
      expect(err.code).toBe('PGW_ALREADY_APPROVED');
      expect(err.status).toBe(409);
    }
  });
});

// =============================================
// getPayment
// =============================================
describe('getPayment', () => {
  it('성공 → PaymentOrderResponse 반환', async () => {
    const responseData = {
      paymentKey: 'pk-123',
      orderId: 'ORDER-001',
      orderName: '테스트 상품',
      status: 'DONE',
      amount: 10000,
      paymentMethod: 'CARD',
      approvedAt: '2025-03-02T15:30:00.000Z',
      requestedAt: '2025-03-02T15:00:00.000Z',
    };
    mockFetch.mockResolvedValue(jsonResponse({ data: responseData }));

    const result = await getPayment(SECRET_KEY, 'pk-123');

    expect(result).toEqual(responseData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/pg/v1/payments/pk-123'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
  });

  it('404 에러 → PgApiError (결제 건 미존재)', async () => {
    const errorBody = { error: { code: 'PGW_NOT_FOUND', message: '결제 건 미존재' } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 404));

    await expect(getPayment(SECRET_KEY, 'nonexistent')).rejects.toThrow(PgApiError);

    try {
      await getPayment(SECRET_KEY, 'nonexistent');
    } catch (e) {
      const err = e as PgApiError;
      expect(err.code).toBe('PGW_NOT_FOUND');
      expect(err.status).toBe(404);
    }
  });
});
