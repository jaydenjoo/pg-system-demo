// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgCheckout, PgCheckoutError } from '@/lib/pg-checkout-sdk';
import { IFRAME_TO_SDK_TYPES, SDK_TO_IFRAME_TYPES, SDK_ERROR_CODES } from '@/types/sdk-protocol';
import type { PgCheckoutOptions } from '@/types/sdk-protocol';

// ---- 기본 옵션 ----

const baseOptions: PgCheckoutOptions = {
  clientKey: 'ck_test_123',
  paymentKey: 'pay_test_abc',
  amount: 10000,
  orderName: '테스트 상품',
  orderId: 'ORDER-001',
  onSuccess: vi.fn(),
  onFail: vi.fn(),
  onCancel: vi.fn(),
};

// ---- 테스트 ----

describe('PgCheckout', () => {
  let sdk: PgCheckout;

  beforeEach(() => {
    vi.useFakeTimers();
    sdk = PgCheckout.create('ck_test_123');
    // DOM 정리
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // cleanup
    document.body.innerHTML = '';
  });

  // ============================================================
  // create()
  // ============================================================

  describe('create()', () => {
    it('유효한 clientKey로 인스턴스 생성', () => {
      const instance = PgCheckout.create('ck_live_abc');
      expect(instance).toBeInstanceOf(PgCheckout);
    });

    it('빈 문자열 clientKey → PgCheckoutError', () => {
      expect(() => PgCheckout.create('')).toThrow(PgCheckoutError);
    });

    it('null/undefined → PgCheckoutError', () => {
      expect(() => PgCheckout.create(null as unknown as string)).toThrow(PgCheckoutError);
      expect(() => PgCheckout.create(undefined as unknown as string)).toThrow(PgCheckoutError);
    });
  });

  // ============================================================
  // open()
  // ============================================================

  describe('open()', () => {
    it('오버레이와 iframe을 DOM에 추가', () => {
      sdk.open({ ...baseOptions });

      const overlay = document.getElementById('pg-checkout-overlay');
      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement | null;

      expect(overlay).not.toBeNull();
      expect(iframe).not.toBeNull();
      expect(iframe?.tagName).toBe('IFRAME');
    });

    it('iframe src에 paymentKey, clientKey 포함', () => {
      sdk.open({ ...baseOptions });

      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement;
      const url = new URL(iframe.src);

      expect(url.searchParams.get('paymentKey')).toBe('pay_test_abc');
      expect(url.searchParams.get('clientKey')).toBe('ck_test_123');
    });

    it('iframe sandbox 속성 설정', () => {
      sdk.open({ ...baseOptions });

      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement;
      expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin allow-scripts allow-forms');
    });

    it('이미 열린 상태에서 다시 open → PgCheckoutError', () => {
      sdk.open({ ...baseOptions });
      expect(() => sdk.open({ ...baseOptions })).toThrow(PgCheckoutError);
    });
  });

  // ============================================================
  // close()
  // ============================================================

  describe('close()', () => {
    it('열려 있지 않으면 아무것도 안 함', () => {
      // 에러 없이 실행되어야 함
      sdk.close();
    });

    it('close 후 오버레이 제거 (fade-out 후)', () => {
      sdk.open({ ...baseOptions });

      expect(document.getElementById('pg-checkout-overlay')).not.toBeNull();

      sdk.close();

      // fade-out 타이머 (200ms) 이후 제거
      vi.advanceTimersByTime(300);

      expect(document.getElementById('pg-checkout-overlay')).toBeNull();
    });
  });

  // ============================================================
  // postMessage 핸들링
  // ============================================================

  describe('postMessage 핸들링', () => {
    it('READY 메시지 수신 → INIT 메시지 전송', () => {
      const postMessageSpy = vi.fn();
      sdk.open({ ...baseOptions });

      // iframe contentWindow mock
      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        value: { postMessage: postMessageSpy },
        writable: true,
      });

      // READY 메시지 시뮬레이션 (origin 검증은 isAllowedCheckoutOrigin이 localhost:3500 허용)
      const readyEvent = new MessageEvent('message', {
        data: { type: IFRAME_TO_SDK_TYPES.READY },
        origin: 'http://localhost:3500',
      });
      window.dispatchEvent(readyEvent);

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SDK_TO_IFRAME_TYPES.INIT,
          paymentKey: 'pay_test_abc',
          clientKey: 'ck_test_123',
          amount: 10000,
        }),
        '*',
      );
    });

    it('READY 수신 → load 타임아웃 해제', () => {
      sdk.open({ ...baseOptions });

      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        value: { postMessage: vi.fn() },
        writable: true,
      });

      // READY 메시지 수신
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: IFRAME_TO_SDK_TYPES.READY },
          origin: 'http://localhost:3500',
        }),
      );

      // 10초 이상 경과해도 onFail 호출 안 됨
      vi.advanceTimersByTime(15000);
      expect(baseOptions.onFail).not.toHaveBeenCalled();
    });

    it('CONFIRM_SUCCESS → onSuccess 콜백 호출', () => {
      const onSuccess = vi.fn();
      sdk.open({ ...baseOptions, onSuccess });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
            paymentKey: 'pay_test_abc',
            orderId: 'ORDER-001',
            amount: 10000,
            approvedAt: '2026-03-04T12:00:00Z',
          },
          origin: 'http://localhost:3500',
        }),
      );

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentKey: 'pay_test_abc',
          amount: 10000,
        }),
      );
    });

    it('CONFIRM_FAIL → onFail 콜백 호출', () => {
      const onFail = vi.fn();
      sdk.open({ ...baseOptions, onFail });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.CONFIRM_FAIL,
            code: 'ACQ_001',
            message: '잔액 부족',
            orderId: 'ORDER-001',
          },
          origin: 'http://localhost:3500',
        }),
      );

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ACQ_001' }),
      );
    });

    it('CANCEL → onCancel 콜백 호출', () => {
      const onCancel = vi.fn();
      sdk.open({ ...baseOptions, onCancel });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.CANCEL,
            orderId: 'ORDER-001',
          },
          origin: 'http://localhost:3500',
        }),
      );

      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'ORDER-001' }),
      );
    });

    it('RESIZE → iframe 높이 변경', () => {
      sdk.open({ ...baseOptions });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.RESIZE,
            height: 750,
          },
          origin: 'http://localhost:3500',
        }),
      );

      const iframe = document.getElementById('pg-checkout-iframe') as HTMLIFrameElement;
      expect(iframe.style.height).toBe('750px');
    });

    it('ERROR → onFail 콜백 호출', () => {
      const onFail = vi.fn();
      sdk.open({ ...baseOptions, onFail });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.ERROR,
            code: 'VERIFY_FAILED',
            message: '검증 실패',
          },
          origin: 'http://localhost:3500',
        }),
      );

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VERIFY_FAILED' }),
      );
    });

    it('잘못된 origin → 메시지 무시', () => {
      const onSuccess = vi.fn();
      sdk.open({ ...baseOptions, onSuccess });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS,
            paymentKey: 'pay_test',
            orderId: 'ORDER-1',
            amount: 10000,
            approvedAt: '2026-03-04T12:00:00Z',
          },
          origin: 'https://evil.com',
        }),
      );

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('잘못된 메시지 구조 → 무시', () => {
      const onSuccess = vi.fn();
      sdk.open({ ...baseOptions, onSuccess });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'RANDOM_GARBAGE', foo: 'bar' },
          origin: 'http://localhost:3500',
        }),
      );

      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 타임아웃
  // ============================================================

  describe('로드 타임아웃', () => {
    it('10초 내 READY 미수신 → onFail(TIMEOUT)', () => {
      const onFail = vi.fn();
      sdk.open({ ...baseOptions, onFail });

      vi.advanceTimersByTime(10_000);

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({
          code: SDK_ERROR_CODES.TIMEOUT,
        }),
      );
    });

    it('타임아웃 후 DOM 정리', () => {
      sdk.open({ ...baseOptions });

      vi.advanceTimersByTime(10_000);

      // fade-out 타이머
      vi.advanceTimersByTime(300);

      expect(document.getElementById('pg-checkout-overlay')).toBeNull();
    });
  });
});
