// ============================================================
// SDK ↔ iframe postMessage 프로토콜 타입 정의
// PCI DSS 격리: 카드 데이터는 iframe 내부에서만 처리
// ============================================================

// ---- 메시지 타입 상수 ----

/** SDK → iframe 메시지 타입 */
export const SDK_TO_IFRAME_TYPES = {
  /** SDK가 iframe에 초기화 데이터 전송 */
  INIT: 'PG_INIT',
  /** SDK가 iframe에 닫기 요청 */
  CLOSE: 'PG_CLOSE',
} as const;

/** iframe → SDK 메시지 타입 */
export const IFRAME_TO_SDK_TYPES = {
  /** iframe 로드 완료, 초기화 데이터 요청 */
  READY: 'PG_READY',
  /** 결제 승인 성공 */
  CONFIRM_SUCCESS: 'PG_CONFIRM_SUCCESS',
  /** 결제 승인 실패 */
  CONFIRM_FAIL: 'PG_CONFIRM_FAIL',
  /** 사용자가 결제 취소 */
  CANCEL: 'PG_CANCEL',
  /** iframe 높이 변경 (자동 리사이즈) */
  RESIZE: 'PG_RESIZE',
  /** iframe 내부 오류 */
  ERROR: 'PG_ERROR',
} as const;

// ---- SDK → iframe 메시지 페이로드 ----

/** INIT 메시지: SDK가 iframe에 결제 정보 전달 */
export interface SdkInitPayload {
  type: typeof SDK_TO_IFRAME_TYPES.INIT;
  paymentKey: string;
  clientKey: string;
  amount: number;
  orderName: string;
  orderId: string;
  customerEmail?: string;
  customerName?: string;
}

/** CLOSE 메시지: SDK가 iframe에 닫기 요청 */
export interface SdkClosePayload {
  type: typeof SDK_TO_IFRAME_TYPES.CLOSE;
}

/** SDK → iframe 메시지 유니온 */
export type SdkToIframeMessage = SdkInitPayload | SdkClosePayload;

// ---- iframe → SDK 메시지 페이로드 ----

/** READY 메시지: iframe 로드 완료 */
export interface IframeReadyPayload {
  type: typeof IFRAME_TO_SDK_TYPES.READY;
}

/** CONFIRM_SUCCESS 메시지: 결제 승인 성공 */
export interface IframeConfirmSuccessPayload {
  type: typeof IFRAME_TO_SDK_TYPES.CONFIRM_SUCCESS;
  paymentKey: string;
  orderId: string;
  amount: number;
  approvedAt: string;
}

/** CONFIRM_FAIL 메시지: 결제 승인 실패 */
export interface IframeConfirmFailPayload {
  type: typeof IFRAME_TO_SDK_TYPES.CONFIRM_FAIL;
  code: string;
  message: string;
  orderId: string;
}

/** CANCEL 메시지: 사용자 결제 취소 */
export interface IframeCancelPayload {
  type: typeof IFRAME_TO_SDK_TYPES.CANCEL;
  orderId: string;
}

/** RESIZE 메시지: iframe 높이 변경 */
export interface IframeResizePayload {
  type: typeof IFRAME_TO_SDK_TYPES.RESIZE;
  height: number;
}

/** ERROR 메시지: iframe 내부 오류 */
export interface IframeErrorPayload {
  type: typeof IFRAME_TO_SDK_TYPES.ERROR;
  code: string;
  message: string;
}

/** iframe → SDK 메시지 유니온 */
export type IframeToSdkMessage =
  | IframeReadyPayload
  | IframeConfirmSuccessPayload
  | IframeConfirmFailPayload
  | IframeCancelPayload
  | IframeResizePayload
  | IframeErrorPayload;

// ---- SDK open() 옵션 ----

/** PgCheckout.open() 호출 시 전달하는 옵션 */
export interface PgCheckoutOptions {
  /** 가맹점 공개 키 (client_key_xxx) */
  clientKey: string;
  /** 결제 건 식별 키 (서버에서 발급) */
  paymentKey: string;
  /** 결제 금액 (원) */
  amount: number;
  /** 주문명 */
  orderName: string;
  /** 주문 ID */
  orderId: string;
  /** 고객 이메일 (선택) */
  customerEmail?: string;
  /** 고객 이름 (선택) */
  customerName?: string;
  /** 결제 성공 콜백 */
  onSuccess: (result: IframeConfirmSuccessPayload) => void;
  /** 결제 실패 콜백 */
  onFail: (error: IframeConfirmFailPayload | IframeErrorPayload) => void;
  /** 결제 취소 콜백 (선택) */
  onCancel?: (result: IframeCancelPayload) => void;
}

// ---- 에러 코드 ----

export const SDK_ERROR_CODES = {
  INVALID_ORIGIN: 'SDK_INVALID_ORIGIN',
  INVALID_MESSAGE: 'SDK_INVALID_MESSAGE',
  TIMEOUT: 'SDK_TIMEOUT',
  IFRAME_LOAD_FAILED: 'SDK_IFRAME_LOAD_FAILED',
  ALREADY_OPEN: 'SDK_ALREADY_OPEN',
  VERIFY_FAILED: 'SDK_VERIFY_FAILED',
} as const;

export type SdkErrorCode = (typeof SDK_ERROR_CODES)[keyof typeof SDK_ERROR_CODES];
