// ============================================================
// PG System — 공유 유틸리티
// ============================================================

/**
 * 금액을 한국 원화 형식으로 포맷
 * @example formatAmount(1500000n) → "1,500,000원"
 */
export function formatAmount(amount: bigint): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 금액을 만원 단위로 포맷
 * @example formatAmountInManwon(15000000n) → "1,500만원"
 */
export function formatAmountInManwon(amount: bigint): string {
  const manwon = amount / 10000n;
  return `${manwon.toLocaleString("ko-KR")}만원`;
}

/**
 * 수수료율을 퍼센트 문자열로 포맷
 * @example formatRate("1.5000") → "1.50%"
 */
export function formatRate(rate: string): string {
  const num = parseFloat(rate);
  return `${num.toFixed(2)}%`;
}

/**
 * 날짜를 한국 로케일 문자열로 변환
 * @example formatDate(new Date()) → "2026-02-26"
 */
export function formatDate(date: Date): string {
  return date
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\. /g, "-")
    .replace(".", "");
}

/**
 * 날짜와 시간을 한국 로케일 문자열로 변환
 * @example formatDateTime(new Date()) → "2026-02-26 14:30:00"
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 카드번호 마스킹
 * @example maskCardNumber("4111111111111111") → "411111******1111"
 */
export function maskCardNumber(cardNo: string): string {
  if (cardNo.length < 10) return cardNo;
  const first6 = cardNo.slice(0, 6);
  const last4 = cardNo.slice(-4);
  const masked = "*".repeat(cardNo.length - 10);
  return `${first6}${masked}${last4}`;
}

/**
 * 계좌번호 마스킹
 * @example maskAccountNumber("12345678901234") → "***-***-1234"
 */
export function maskAccountNumber(accountNo: string): string {
  if (accountNo.length < 4) return accountNo;
  const last4 = accountNo.slice(-4);
  return `***-***-${last4}`;
}

/**
 * 사업자등록번호 포맷
 * @example formatBusinessNo("1234567890") → "123-45-67890"
 */
export function formatBusinessNo(no: string): string {
  const cleaned = no.replace(/\D/g, "");
  if (cleaned.length !== 10) return no;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;
}

/**
 * 수수료 계층 검증 (PG마진 ≤ 대리점 수수료 ≤ 가맹점 수수료)
 */
export function validateCommissionHierarchy(
  pgMarginRate: string,
  agentRate: string,
  merchantRate: string,
): boolean {
  const pg = parseFloat(pgMarginRate);
  const agent = parseFloat(agentRate);
  const merchant = parseFloat(merchantRate);
  return pg <= agent && agent <= merchant;
}

/**
 * 정산 금액 계산 (amount - fee = net)
 * BigInt 정밀도 유지: Number() 변환 없이 순수 BigInt 연산 사용
 * feeRate "1.5000" → 분자 15000, 분모 10000000 (소수점 4자리 × 100%)
 */
export function calculateNetAmount(amount: bigint, feeRate: string): bigint {
  const [intPart, decPart = ""] = feeRate.split(".");
  const paddedDec = decPart.padEnd(4, "0").slice(0, 4);
  const rateScaled = BigInt(intPart + paddedDec); // feeRate * 10000
  const fee = (amount * rateScaled) / 1000000n; // amount * rate / (10000 * 100)
  return amount - fee;
}

/**
 * 비밀번호 정책 검증 (최소 12자, 대/소문자, 숫자, 특수문자 포함)
 */
export function validatePasswordPolicy(password: string): boolean {
  if (password.length < 12) return false;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

/**
 * 은행 계좌번호 마스킹
 * @example maskBankAccount("12345678901234") → "****1234"
 */
export function maskBankAccount(account: string | null): string | null {
  if (!account) return null;
  return "****" + account.slice(-4);
}
