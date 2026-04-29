// ============================================================
// Checkout UI — 결제 관련 프론트엔드 타입 정의
// ============================================================

/** 결제 수단 코드 */
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'VIRTUAL_ACCOUNT' | 'CASH';

/** 결제 상태 코드 */
export type PaymentStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'CANCELED'
  | 'PARTIAL_CANCELED'
  | 'ABORTED'
  | 'EXPIRED'
  | 'WAITING_FOR_DEPOSIT';

/** 카드 결제 상세 */
export interface CardPaymentDetail {
  company: string;
  number: string;
  installmentPlanMonths: number;
  approveNo: string;
  cardType: string;
}

/** 가상계좌 결제 상세 */
export interface VirtualAccountDetail {
  accountNumber: string;
  bankCode: string;
  customerName: string;
  dueDate: string;
}

// ---- 요청 타입 ----

/** 결제 주문 생성 요청 */
export interface CreatePaymentOrderInput {
  orderId: string;
  amount: number;
  orderName: string;
  paymentMethod?: PaymentMethod | undefined;
  customerEmail?: string | undefined;
  customerName?: string | undefined;
  successUrl?: string | undefined;
  failUrl?: string | undefined;
}

/** 결제 승인 요청 */
export interface ConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
  cardNumber?: string | undefined;
  installmentMonths?: number | undefined;
}

/** 결제 취소 요청 */
export interface CancelPaymentInput {
  cancelReason: string;
  cancelAmount?: number | undefined;
}

// ---- 응답 타입 ----

/** 결제 주문 응답 (서버 → 클라이언트) */
export interface PaymentOrderResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: PaymentStatus;
  amount: number;
  paymentMethod: PaymentMethod | null;
  approvedAt: string | null;
  requestedAt: string;
  card?: CardPaymentDetail | null | undefined;
  virtualAccount?: VirtualAccountDetail | null | undefined;
}

// ---- 체크아웃 폼 전용 타입 ----

/** 체크아웃 폼 입력값 (UI 바인딩용) */
export interface CheckoutFormValues {
  orderId: string;
  orderName: string;
  amount: number;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardholderName: string;
  customerEmail: string;
  customerName: string;
  installmentMonths: number;
}
