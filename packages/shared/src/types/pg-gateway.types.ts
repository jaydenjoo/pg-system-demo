// ============================================================
// PG Gateway — 공유 타입 정의
// ============================================================

import type {
  PgPaymentStatusCode,
  WebhookEventType,
  PaymentMethodCode,
  CardCompany,
} from '../constants';

/** 결제 주문 생성 요청 */
export interface CreatePaymentOrderRequest {
  orderId: string;
  amount: number;
  orderName: string;
  paymentMethod?: PaymentMethodCode;
  customerEmail?: string;
  customerName?: string;
  successUrl?: string;
  failUrl?: string;
}

/** 결제 승인 요청 */
export interface ConfirmPaymentRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

/** 결제 취소 요청 */
export interface CancelPaymentRequest {
  cancelReason: string;
  cancelAmount?: number;
}

/** 결제 상태 응답 */
export interface PaymentOrderResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: PgPaymentStatusCode;
  amount: number;
  paymentMethod: PaymentMethodCode | null;
  approvedAt: string | null;
  requestedAt: string;
  card?: PgCardPaymentDetail | null;
  virtualAccount?: PgVirtualAccountDetail | null;
}

/** 가상계좌 결제 상세 (PG Gateway 전용) */
export interface PgVirtualAccountDetail {
  accountNumber: string;
  bankCode: string;
  customerName: string;
  dueDate: string;  // ISO 8601
}

/** 가상계좌 입금 콜백 요청 (Mock 은행 → PG) */
export interface DepositCallbackRequest {
  accountNumber: string;
  amount: number;
  depositorName: string;
  bankCode: string;
  depositedAt?: string;  // ISO 8601
}

/** 카드 결제 상세 (PG Gateway 전용) */
export interface PgCardPaymentDetail {
  company: CardCompany;
  number: string;        // 마스킹된 카드번호
  installmentPlanMonths: number;
  approveNo: string;     // 승인번호
  cardType: string;      // 신용/체크
}

/** Mock 카드사 승인 응답 */
export interface AcquirerApprovalResponse {
  success: boolean;
  approveNo?: string;
  errorCode?: string;
  errorMessage?: string;
  cardCompany?: CardCompany;
  cardType?: string;
}

/** 웹훅 페이로드 */
export interface WebhookPayload {
  eventType: WebhookEventType;
  createdAt: string;
  data: {
    paymentKey: string;
    orderId: string;
    status: PgPaymentStatusCode;
    approvedAt?: string;
    amount: number;
    cancelAmount?: number;
    cancelReason?: string;
  };
}

/** API 키 생성 응답 */
export interface CreateApiKeyResponse {
  clientKey: string;
  secretKey: string;   // 최초 1회만 평문 반환
  webhookUrl?: string;
}

// ============================================================
// Phase 3: Mock 카드사/은행 프로세서 타입
// ============================================================

/** 카드 승인 요청 */
export interface CardApprovalRequest {
  cardNumber: string;
  amount: number;
  installmentMonths: number;
  merchantId: string;
}

/** 카드 승인 응답 */
export interface CardApprovalResponse {
  success: boolean;
  approvalNumber?: string;
  cardCompany?: string;
  cardType?: string;
  maskedCardNumber?: string;
  errorCode?: string;
  errorMessage?: string;
  approvedAt?: string;  // ISO 8601
}

/** 카드 취소 요청 */
export interface CardCancelRequest {
  approvalNumber: string;
  cancelAmount: number;
  reason: string;
}

/** 카드 취소 응답 */
export interface CardCancelResponse {
  success: boolean;
  cancelNumber?: string;
  cancelledAt?: string;  // ISO 8601
  errorCode?: string;
  errorMessage?: string;
}

/** 계좌이체 요청 */
export interface BankTransferRequest {
  bankCode: string;
  accountNumber: string;
  amount: number;
  merchantId: string;
}

/** 계좌이체 응답 */
export interface BankTransferResponse {
  success: boolean;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: string;  // ISO 8601
}

/** 가상계좌 발급 요청 */
export interface VirtualAccountRequest {
  bankCode: string;
  amount: number;
  customerName: string;
  expiresAt?: string;  // ISO 8601, 미입력 시 72시간 후
}

/** 가상계좌 발급 응답 */
export interface VirtualAccountResponse {
  success: boolean;
  accountNumber?: string;
  bankCode?: string;
  dueDate?: string;  // ISO 8601
  errorCode?: string;
  errorMessage?: string;
}

// ---- FDS (이상거래탐지) 타입 ----

/** FDS 룰 위반 항목 */
export interface FdsViolation {
  /** 룰 식별자 ("R1" ~ "R5") */
  ruleId: string;
  /** 위반 심각도 */
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 처리 방식 */
  action: 'BLOCK' | 'WARN';
  /** 위반 메시지 */
  message: string;
}

/** FDS 평가 결과 */
export interface FdsEvaluationResult {
  /** true면 결제 차단 */
  blocked: boolean;
  /** 경고 메시지 목록 (결제는 진행) */
  warnings: string[];
  /** 위반 룰 목록 */
  violations: FdsViolation[];
}
