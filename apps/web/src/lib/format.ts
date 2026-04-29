/** 문자열 금액(Decimal.toString)을 number로 파싱. NaN이면 0 반환. */
export function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** 금액 포맷: 1,234,567원 */
export function formatAmount(
  amount: number | string | null | undefined,
): string {
  const num = parseAmount(amount as string | number | null | undefined);
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

/** 날짜+시간 포맷 (한국 로케일): 2026. 2. 27. 오후 3:00 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

/** 날짜만 포맷 (한국 로케일): 2026년 2월 27일 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateStr));
}

/** 원화 포맷: 1,234,567원 */
export function formatKRW(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

/** 건수 포맷: 1,234건 */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("ko-KR").format(count) + "건";
}

/** 축약 금액 포맷: 1.2억, 350만, 1,234 */
export function formatShortAmount(amount: number): string {
  if (amount >= 100_000_000) {
    return (amount / 100_000_000).toFixed(1) + "억";
  }
  if (amount >= 10_000) {
    return Math.round(amount / 10_000) + "만";
  }
  return new Intl.NumberFormat("ko-KR").format(amount);
}
