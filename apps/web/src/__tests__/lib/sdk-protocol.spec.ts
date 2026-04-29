import { describe, it, expect } from 'vitest';
import {
  sdkToIframeSchema,
  iframeToSdkSchema,
  isPgSystemOrigin,
  isAllowedCheckoutOrigin,
  parseSdkToIframeMessage,
  parseIframeToSdkMessage,
} from '@/lib/sdk-validator';
import {
  SDK_TO_IFRAME_TYPES,
  IFRAME_TO_SDK_TYPES,
} from '@/types/sdk-protocol';

// ============================================================
// 1. SDK → iframe 메시지 스키마 검증
// ============================================================

describe('sdkToIframeSchema', () => {
  it('유효한 INIT 메시지 파싱 성공', () => {
    const msg = {
      type: SDK_TO_IFRAME_TYPES.INIT,
      paymentKey: 'pay_123',
      clientKey: 'ck_abc',
      amount: 10000,
      orderName: '테스트',
      orderId: 'ORDER-1',
    };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('INIT 메시지에 optional 필드 포함 가능', () => {
    const msg = {
      type: SDK_TO_IFRAME_TYPES.INIT,
      paymentKey: 'pay_123',
      clientKey: 'ck_abc',
      amount: 10000,
      orderName: '테스트',
      orderId: 'ORDER-1',
      customerEmail: 'test@example.com',
      customerName: '홍길동',
    };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('INIT 메시지 — paymentKey 누락 시 실패', () => {
    const msg = {
      type: SDK_TO_IFRAME_TYPES.INIT,
      clientKey: 'ck_abc',
      amount: 10000,
      orderName: '테스트',
      orderId: 'ORDER-1',
    };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('INIT 메시지 — amount가 0이면 실패 (positive)', () => {
    const msg = {
      type: SDK_TO_IFRAME_TYPES.INIT,
      paymentKey: 'pay_123',
      clientKey: 'ck_abc',
      amount: 0,
      orderName: '테스트',
      orderId: 'ORDER-1',
    };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('유효한 CLOSE 메시지 파싱 성공', () => {
    const msg = { type: SDK_TO_IFRAME_TYPES.CLOSE };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('알 수 없는 type → 실패', () => {
    const msg = { type: 'UNKNOWN_TYPE' };
    const result = sdkToIframeSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 2. iframe → SDK 메시지 스키마 검증
// ============================================================

describe('iframeToSdkSchema', () => {
  it('READY 메시지', () => {
    const msg = { type: IFRAME_TO_SDK_TYPES.READY };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('CONFIRM_SUCCESS 메시지', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
      paymentKey: 'pay_123',
      orderId: 'ORDER-1',
      amount: 10000,
      approvedAt: '2026-03-04T12:00:00Z',
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('CONFIRM_FAIL 메시지', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.CONFIRM_FAIL,
      code: 'ACQ_001',
      message: '한도 초과',
      orderId: 'ORDER-1',
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('CANCEL 메시지', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.CANCEL,
      orderId: 'ORDER-1',
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('RESIZE 메시지', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.RESIZE,
      height: 600,
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('RESIZE — height가 음수면 실패', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.RESIZE,
      height: -100,
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(false);
  });

  it('ERROR 메시지', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.ERROR,
      code: 'SDK_TIMEOUT',
      message: '시간 초과',
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(true);
  });

  it('CONFIRM_SUCCESS — amount 누락 시 실패', () => {
    const msg = {
      type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
      paymentKey: 'pay_123',
      orderId: 'ORDER-1',
      approvedAt: '2026-03-04T12:00:00Z',
    };
    expect(iframeToSdkSchema.safeParse(msg).success).toBe(false);
  });
});

// ============================================================
// 3. origin 검증 함수
// ============================================================

describe('origin 검증', () => {
  it('isPgSystemOrigin — 기본값 localhost:3500 일치', () => {
    expect(isPgSystemOrigin('http://localhost:3500')).toBe(true);
  });

  it('isPgSystemOrigin — 불일치', () => {
    expect(isPgSystemOrigin('https://evil.com')).toBe(false);
  });

  it('isAllowedCheckoutOrigin — 기본값 localhost:3500 일치', () => {
    expect(isAllowedCheckoutOrigin('http://localhost:3500')).toBe(true);
  });

  it('isAllowedCheckoutOrigin — 불일치', () => {
    expect(isAllowedCheckoutOrigin('https://attacker.com')).toBe(false);
  });
});

// ============================================================
// 4. 메시지 파싱 유틸
// ============================================================

describe('parseSdkToIframeMessage', () => {
  it('유효한 메시지 → success: true', () => {
    const result = parseSdkToIframeMessage({
      type: SDK_TO_IFRAME_TYPES.INIT,
      paymentKey: 'pay_123',
      clientKey: 'ck_abc',
      amount: 5000,
      orderName: '상품',
      orderId: 'ORD-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('PG_INIT');
    }
  });

  it('잘못된 메시지 → success: false + error', () => {
    const result = parseSdkToIframeMessage({ type: 'INVALID' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it('null 입력 → success: false', () => {
    const result = parseSdkToIframeMessage(null);
    expect(result.success).toBe(false);
  });
});

describe('parseIframeToSdkMessage', () => {
  it('유효한 READY 메시지 파싱', () => {
    const result = parseIframeToSdkMessage({ type: IFRAME_TO_SDK_TYPES.READY });
    expect(result.success).toBe(true);
  });

  it('유효한 CONFIRM_SUCCESS 파싱', () => {
    const result = parseIframeToSdkMessage({
      type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
      paymentKey: 'pay_123',
      orderId: 'ORD-1',
      amount: 10000,
      approvedAt: '2026-03-04T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('undefined 입력 → success: false', () => {
    const result = parseIframeToSdkMessage(undefined);
    expect(result.success).toBe(false);
  });
});
