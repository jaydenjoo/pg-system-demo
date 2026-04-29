// ============================================================
// AcquirerProvider — VAN 어댑터 공통 인터페이스
// 비유: 콘센트(인터페이스) 표준화 → 가전(VAN사)만 교체
// ============================================================

import type {
  CardApprovalRequest,
  CardApprovalResponse,
  CardCancelRequest,
  CardCancelResponse,
  BankTransferRequest,
  BankTransferResponse,
  VirtualAccountRequest,
  VirtualAccountResponse,
} from './pg-gateway.types';

/** VAN 어댑터 공통 인터페이스 — 모든 VAN 어댑터가 이 4개 메서드를 구현 */
export interface AcquirerProvider {
  /** VAN 프로바이더 이름 (MOCK | NICE | KIS | KICC) */
  readonly providerName: string;

  /** 카드 결제 승인 */
  processCardPayment(
    params: CardApprovalRequest,
  ): Promise<CardApprovalResponse>;

  /** 카드 결제 취소 */
  cancelCardPayment(
    params: CardCancelRequest,
  ): Promise<CardCancelResponse>;

  /** 계좌이체 */
  processBankTransfer(
    params: BankTransferRequest,
  ): Promise<BankTransferResponse>;

  /** 가상계좌 발급 */
  createVirtualAccount(
    params: VirtualAccountRequest,
  ): Promise<VirtualAccountResponse>;
}

/** 지원하는 VAN 프로바이더 코드 */
export type VanProviderCode = 'MOCK' | 'NICE' | 'KIS' | 'KICC';

/** DI 토큰 상수 — NestJS useFactory에서 사용 */
export const ACQUIRER_PROVIDER = 'ACQUIRER_PROVIDER';
