// ============================================================
// PG Gateway — 결제 API 클라이언트 (Basic Auth)
// ⚠️ 데모 사이트(Vercel) 빌드용 — 'server-only' 일시 비활성화.
// payment-test/page.tsx가 클라이언트 컴포넌트에서 DEMO_SECRET_KEY로 호출하기 때문.
// 운영 배포 시: API Route 또는 Server Action으로 리팩토링 후 'server-only' 복원 필요.
// 관리자 대시보드(api-client.ts)와 다른 인증 방식 사용:
//   - api-client.ts → JWT 쿠키 (credentials: 'include')
//   - payment-client.ts → PG Basic Auth (Base64 secretKey:) — 데모/내부망 전용
// ============================================================
// import 'server-only'; // TEMP DISABLED for demo build (Vercel)

import type {
  CreatePaymentOrderInput,
  ConfirmPaymentInput,
  PaymentOrderResponse,
} from '@/types/payment';

// 서버 전용 환경변수 (NEXT_PUBLIC_ 접두사 제거 — 브라우저 노출 차단)
const PG_API_BASE = process.env.PG_API_URL ?? '';

/** PG API 에러 */
export class PgApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PgApiError';
  }
}

/** Basic Auth 헤더 생성 — 서버 전용 (Node.js Buffer 사용, btoa 대체) */
function buildBasicAuthHeader(secretKey: string): string {
  // PG 표준: secretKey만 사용 (username 부분 비어있음)
  const encoded = Buffer.from(`${secretKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * PG Gateway API 호출 공통 함수.
 * Basic Auth 인증 사용 — JWT 쿠키와 별도.
 */
async function pgFetch<T>(
  path: string,
  secretKey: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${PG_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildBasicAuthHeader(secretKey),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorBody: { error?: { code?: string; message?: string } };
    try {
      errorBody = (await res.json()) as typeof errorBody;
    } catch {
      errorBody = {};
    }

    throw new PgApiError(
      errorBody.error?.code ?? 'PG_UNKNOWN',
      errorBody.error?.message ?? '결제 처리 중 오류가 발생했습니다.',
      res.status,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json()) as { data: T };
  return json.data;
}

// ---- Public API ----

/**
 * 결제 주문 생성 (Step 1).
 * POST /pg/v1/payments
 */
export function createPaymentOrder(
  secretKey: string,
  input: CreatePaymentOrderInput,
): Promise<PaymentOrderResponse> {
  return pgFetch<PaymentOrderResponse>('/pg/v1/payments', secretKey, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 결제 승인 (Step 2).
 * POST /pg/v1/payments/confirm
 */
export function confirmPayment(
  secretKey: string,
  input: ConfirmPaymentInput,
): Promise<PaymentOrderResponse> {
  return pgFetch<PaymentOrderResponse>('/pg/v1/payments/confirm', secretKey, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 결제 조회 (Step 3).
 * GET /pg/v1/payments/:paymentKey
 */
export function getPayment(
  secretKey: string,
  paymentKey: string,
): Promise<PaymentOrderResponse> {
  return pgFetch<PaymentOrderResponse>(
    `/pg/v1/payments/${paymentKey}`,
    secretKey,
  );
}

/**
 * 결제 취소 (Step 4).
 * POST /pg/v1/payments/:paymentKey/cancel
 */
export function cancelPayment(
  secretKey: string,
  paymentKey: string,
  input: { cancelReason: string; cancelAmount?: number },
): Promise<PaymentOrderResponse> {
  return pgFetch<PaymentOrderResponse>(
    `/pg/v1/payments/${paymentKey}/cancel`,
    secretKey,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
