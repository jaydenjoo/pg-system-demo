import { describe, it, expect } from "vitest";
import {
  parseAmount,
  formatAmount,
  formatKRW,
  formatCount,
  formatShortAmount,
  formatDate,
  formatDateOnly,
} from "@/lib/format";

// =============================================
// parseAmount — 문자열/숫자 → number 변환
// =============================================
describe("parseAmount", () => {
  it("null → 0", () => {
    expect(parseAmount(null)).toBe(0);
  });

  it("undefined → 0", () => {
    expect(parseAmount(undefined)).toBe(0);
  });

  it("숫자 그대로 반환", () => {
    expect(parseAmount(12345)).toBe(12345);
  });

  it("문자열 숫자 → number 변환", () => {
    expect(parseAmount("1234567")).toBe(1234567);
  });

  it("소수점 문자열 → number 변환 (Decimal)", () => {
    expect(parseAmount("1234567.89")).toBe(1234567.89);
  });

  it("빈 문자열 → 0 (NaN 방지)", () => {
    expect(parseAmount("" as unknown as string)).toBe(0);
  });

  it("NaN 문자열 → 0", () => {
    expect(parseAmount("abc")).toBe(0);
  });

  it("음수 처리", () => {
    expect(parseAmount("-5000")).toBe(-5000);
  });

  it("0 문자열 → 0", () => {
    expect(parseAmount("0")).toBe(0);
  });

  it("매우 큰 숫자 처리", () => {
    expect(parseAmount("999999999999")).toBe(999999999999);
  });
});

// =============================================
// formatAmount — 금액 포맷
// =============================================
describe("formatAmount", () => {
  it("숫자 → 원화 포맷", () => {
    expect(formatAmount(1234567)).toBe("1,234,567원");
  });

  it("문자열 숫자 → 원화 포맷", () => {
    expect(formatAmount("9876543")).toBe("9,876,543원");
  });

  it("0 → 0원", () => {
    expect(formatAmount(0)).toBe("0원");
  });

  it("null → 0원", () => {
    expect(formatAmount(null)).toBe("0원");
  });

  it("undefined → 0원", () => {
    expect(formatAmount(undefined)).toBe("0원");
  });
});

// =============================================
// formatKRW — 숫자 → 원화 포맷
// =============================================
describe("formatKRW", () => {
  it("일반 금액 포맷", () => {
    expect(formatKRW(5000000)).toBe("5,000,000원");
  });

  it("0원", () => {
    expect(formatKRW(0)).toBe("0원");
  });

  it("음수 금액", () => {
    expect(formatKRW(-1000)).toBe("-1,000원");
  });
});

// =============================================
// formatCount — 건수 포맷
// =============================================
describe("formatCount", () => {
  it("일반 건수 포맷", () => {
    expect(formatCount(1234)).toBe("1,234건");
  });

  it("0건", () => {
    expect(formatCount(0)).toBe("0건");
  });

  it("1건", () => {
    expect(formatCount(1)).toBe("1건");
  });
});

// =============================================
// formatShortAmount — 억/만/일반 축약 포맷
// =============================================
describe("formatShortAmount", () => {
  it("1억 이상 → 억 단위", () => {
    expect(formatShortAmount(120_000_000)).toBe("1.2억");
  });

  it("정확히 1억", () => {
    expect(formatShortAmount(100_000_000)).toBe("1.0억");
  });

  it("10억", () => {
    expect(formatShortAmount(1_000_000_000)).toBe("10.0억");
  });

  it("1만 이상 ~ 1억 미만 → 만 단위", () => {
    expect(formatShortAmount(3_500_000)).toBe("350만");
  });

  it("정확히 1만", () => {
    expect(formatShortAmount(10_000)).toBe("1만");
  });

  it("1만 미만 → 일반 숫자 포맷", () => {
    expect(formatShortAmount(1234)).toBe("1,234");
  });

  it("0", () => {
    expect(formatShortAmount(0)).toBe("0");
  });

  it("9999 (1만 미만 경계)", () => {
    expect(formatShortAmount(9999)).toBe("9,999");
  });
});

// =============================================
// formatDate — ISO → 한국 날짜+시간
// =============================================
describe("formatDate", () => {
  it("null → '-'", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("undefined → '-'", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("빈 문자열 → '-'", () => {
    expect(formatDate("")).toBe("-");
  });

  it("유효한 ISO 문자열 → 한국 로케일 포맷 반환", () => {
    const result = formatDate("2026-03-01T15:30:00Z");
    // 한국 시간대에 따라 다를 수 있으므로 기본 구조만 확인
    expect(result).toContain("2026");
    expect(result).toContain("3");
    expect(result.length).toBeGreaterThan(5);
  });
});

// =============================================
// formatDateOnly — ISO → 한국 날짜만
// =============================================
describe("formatDateOnly", () => {
  it("null → '-'", () => {
    expect(formatDateOnly(null)).toBe("-");
  });

  it("undefined → '-'", () => {
    expect(formatDateOnly(undefined)).toBe("-");
  });

  it("유효한 ISO 문자열 → 한국 날짜 포맷", () => {
    const result = formatDateOnly("2026-03-01T00:00:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("3");
    // 시간은 포함하지 않아야 함
    expect(result).not.toContain(":");
  });
});
