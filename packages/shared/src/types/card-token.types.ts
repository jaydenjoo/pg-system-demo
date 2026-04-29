// ============================================================
// 카드 토큰화 타입 정의 (PCI DSS 3.4 — PAN 토큰화)
// ============================================================

/** 토큰 생성 결과 */
export interface CardTokenResult {
  token: string;
  cardBin: string;
  lastFour: string;
  cardCompany: string;
  cardType?: string;
  cardBrand?: string;
  isNewToken: boolean;
}

/** 토큰 생성 요청 파라미터 */
export interface TokenizeCardParams {
  cardNumber: string;
  merchantId: string;
  cardCompany: string;
  cardType?: string;
  cardBrand?: string;
  createdBy?: string;
}

/** 토큰 비활성화 요청 파라미터 */
export interface DeactivateTokenParams {
  token: string;
  deactivatedBy?: string;
}
