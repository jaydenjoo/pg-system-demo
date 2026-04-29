// ============================================================
// PgCheckout SDK — 가맹점 웹사이트에 결제창 iframe 임베드
// Vanilla TypeScript, 외부 의존성 없음 (esbuild로 번들)
// 사용법:
//   const checkout = PgCheckout.create('ck_live_xxx');
//   checkout.open({ paymentKey, amount, orderName, ... });
// ============================================================

import {
  SDK_TO_IFRAME_TYPES,
  IFRAME_TO_SDK_TYPES,
  SDK_ERROR_CODES,
} from '@/types/sdk-protocol';
import type {
  PgCheckoutOptions,
  IframeConfirmSuccessPayload,
  IframeConfirmFailPayload,
  IframeErrorPayload,
  IframeCancelPayload,
  IframeToSdkMessage,
  SdkErrorCode,
} from '@/types/sdk-protocol';
import { parseIframeToSdkMessage, isAllowedCheckoutOrigin } from '@/lib/sdk-validator';

// ---- 상수 ----

const CHECKOUT_BASE_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CHECKOUT_URL
    ? process.env.NEXT_PUBLIC_CHECKOUT_URL
    : 'http://localhost:3500/checkout-iframe';

const IFRAME_LOAD_TIMEOUT_MS = 10_000;
const IFRAME_ID = 'pg-checkout-iframe';
const OVERLAY_ID = 'pg-checkout-overlay';

// ---- SDK 에러 ----

export class PgCheckoutError extends Error {
  constructor(
    public readonly code: SdkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PgCheckoutError';
  }
}

// ---- 메인 클래스 ----

export class PgCheckout {
  private readonly clientKey: string;
  private options: PgCheckoutOptions | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private isOpen = false;

  private constructor(clientKey: string) {
    this.clientKey = clientKey;
  }

  /** SDK 인스턴스 생성 */
  static create(clientKey: string): PgCheckout {
    if (!clientKey || typeof clientKey !== 'string') {
      throw new PgCheckoutError(
        SDK_ERROR_CODES.INVALID_MESSAGE,
        'clientKey는 필수입니다.',
      );
    }
    return new PgCheckout(clientKey);
  }

  /** 결제창 열기 */
  open(options: PgCheckoutOptions): void {
    if (this.isOpen) {
      throw new PgCheckoutError(
        SDK_ERROR_CODES.ALREADY_OPEN,
        '결제창이 이미 열려 있습니다.',
      );
    }

    this.options = options;
    this.isOpen = true;

    // 1. 오버레이 생성
    this.createOverlay();

    // 2. iframe 생성
    this.createIframe(options);

    // 3. postMessage 리스너 등록
    this.setupMessageHandler();

    // 4. 로드 타임아웃 설정
    this.loadTimer = setTimeout(() => {
      this.handleSdkError(
        SDK_ERROR_CODES.TIMEOUT,
        '결제창 로드 시간이 초과되었습니다.',
      );
    }, IFRAME_LOAD_TIMEOUT_MS);
  }

  /** 결제창 닫기 */
  close(): void {
    if (!this.isOpen) return;

    // iframe에 CLOSE 메시지 전송
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(
        { type: SDK_TO_IFRAME_TYPES.CLOSE },
        '*',
      );
    }

    this.cleanup();
  }

  // ---- private ----

  private createOverlay(): void {
    // 기존 오버레이 제거
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    this.overlay = document.createElement('div');
    this.overlay.id = OVERLAY_ID;
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: '99999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 0.2s ease-in-out',
    });

    document.body.appendChild(this.overlay);

    // 페이드인
    requestAnimationFrame(() => {
      if (this.overlay) this.overlay.style.opacity = '1';
    });
  }

  private createIframe(options: PgCheckoutOptions): void {
    // 기존 iframe 제거
    const existing = document.getElementById(IFRAME_ID);
    if (existing) existing.remove();

    const url = new URL(CHECKOUT_BASE_URL);
    url.searchParams.set('paymentKey', options.paymentKey);
    url.searchParams.set('clientKey', this.clientKey);

    this.iframe = document.createElement('iframe');
    this.iframe.id = IFRAME_ID;
    this.iframe.src = url.toString();
    this.iframe.setAttribute(
      'sandbox',
      'allow-same-origin allow-scripts allow-forms',
    );
    this.iframe.setAttribute('allow', 'payment');

    Object.assign(this.iframe.style, {
      width: '100%',
      maxWidth: '480px',
      minHeight: '500px',
      border: 'none',
      borderRadius: '16px',
      backgroundColor: '#ffffff',
      boxShadow: '0 8px 16px rgba(0,0,0,0.04), 0 20px 48px rgba(0,0,0,0.10)',
    });

    // iframe 로드 에러 핸들링
    this.iframe.onerror = () => {
      this.handleSdkError(
        SDK_ERROR_CODES.IFRAME_LOAD_FAILED,
        '결제창을 불러올 수 없습니다.',
      );
    };

    if (this.overlay) {
      this.overlay.appendChild(this.iframe);
    }
  }

  private setupMessageHandler(): void {
    this.messageHandler = (event: MessageEvent) => {
      // origin 검증
      if (!isAllowedCheckoutOrigin(event.origin)) return;

      const parsed = parseIframeToSdkMessage(event.data);
      if (!parsed.success) return;

      this.handleIframeMessage(parsed.data);
    };

    window.addEventListener('message', this.messageHandler);
  }

  private handleIframeMessage(message: IframeToSdkMessage): void {
    switch (message.type) {
      case IFRAME_TO_SDK_TYPES.READY:
        this.handleReady();
        break;
      case IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS:
        this.handleSuccess(message);
        break;
      case IFRAME_TO_SDK_TYPES.CONFIRM_FAIL:
        this.handleFail(message);
        break;
      case IFRAME_TO_SDK_TYPES.CANCEL:
        this.handleCancel(message);
        break;
      case IFRAME_TO_SDK_TYPES.RESIZE:
        this.handleResize(message.height);
        break;
      case IFRAME_TO_SDK_TYPES.ERROR:
        this.handleIframeError(message);
        break;
    }
  }

  private handleReady(): void {
    // 로드 타임아웃 해제
    if (this.loadTimer !== null) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }

    // iframe에 INIT 데이터 전송
    if (this.iframe?.contentWindow && this.options) {
      this.iframe.contentWindow.postMessage(
        {
          type: SDK_TO_IFRAME_TYPES.INIT,
          paymentKey: this.options.paymentKey,
          clientKey: this.clientKey,
          amount: this.options.amount,
          orderName: this.options.orderName,
          orderId: this.options.orderId,
          customerEmail: this.options.customerEmail,
          customerName: this.options.customerName,
        },
        '*',
      );
    }
  }

  private handleSuccess(result: IframeConfirmSuccessPayload): void {
    const { onSuccess } = this.options ?? {};
    this.cleanup();
    onSuccess?.(result);
  }

  private handleFail(error: IframeConfirmFailPayload): void {
    const { onFail } = this.options ?? {};
    this.cleanup();
    onFail?.(error);
  }

  private handleCancel(result: IframeCancelPayload): void {
    const { onCancel } = this.options ?? {};
    this.cleanup();
    onCancel?.(result);
  }

  private handleResize(height: number): void {
    if (this.iframe) {
      this.iframe.style.height = `${height}px`;
    }
  }

  private handleIframeError(error: IframeErrorPayload): void {
    const { onFail } = this.options ?? {};
    this.cleanup();
    onFail?.(error);
  }

  private handleSdkError(code: SdkErrorCode, message: string): void {
    const { onFail } = this.options ?? {};
    this.cleanup();
    onFail?.({ type: IFRAME_TO_SDK_TYPES.ERROR, code, message });
  }

  private cleanup(): void {
    this.isOpen = false;

    if (this.loadTimer !== null) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }

    if (this.messageHandler !== null) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // 페이드아웃 후 제거
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      const overlay = this.overlay;
      setTimeout(() => overlay.remove(), 200);
      this.overlay = null;
    }

    this.iframe = null;
    this.options = null;
  }
}
