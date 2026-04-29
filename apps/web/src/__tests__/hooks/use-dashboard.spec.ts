import { describe, it, expect, vi, beforeEach } from "vitest";

// SWR 모킹
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

// apiGet 모킹
vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
}));

import {
  useDashboardSummary,
  useTransactionStats,
  useSettlementStats,
  useDailyTrend,
  useTopMerchants,
  useTopAgents,
} from "@/hooks/use-dashboard";
import type { DashboardQuery } from "@/types/dashboard";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useDashboardSummary
// =============================================
describe("useDashboardSummary", () => {
  it("쿼리 없이 호출 → /dashboard/summary key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    const result = useDashboardSummary();

    expect(mockUseSWR).toHaveBeenCalledWith("/dashboard/summary", expect.any(Function));
    expect(result.summary).toBeNull();
    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(false);
  });

  it("날짜 쿼리 → 쿼리스트링 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    const query: DashboardQuery = { startDate: "2026-01-01", endDate: "2026-01-31" };
    useDashboardSummary(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("startDate=2026-01-01");
    expect(key).toContain("endDate=2026-01-31");
  });

  it("데이터 반환 시 summary 추출", () => {
    const summaryData = {
      totalMerchants: 10,
      totalAgents: 5,
      transactionCount: 100,
      totalTransactionAmount: "50000000",
      totalSettlementAmount: "45000000",
      totalDepositAmount: "42000000",
      pendingSettlementCount: 3,
      unmatchedDepositCount: 1,
    };
    mockUseSWR.mockReturnValue({
      data: { data: summaryData },
      error: undefined,
      isLoading: false,
    });

    const result = useDashboardSummary();
    expect(result.summary).toEqual(summaryData);
    expect(result.isLoading).toBe(false);
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Network error"),
      isLoading: false,
    });

    const result = useDashboardSummary();
    expect(result.isError).toBe(true);
    expect(result.summary).toBeNull();
  });
});

// =============================================
// useTransactionStats
// =============================================
describe("useTransactionStats", () => {
  it("쿼리 없이 호출 → /dashboard/transaction-stats key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    useTransactionStats();

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/dashboard/transaction-stats",
      expect.any(Function),
    );
  });

  it("데이터 반환 시 stats 추출", () => {
    const statsData = {
      byStatus: [{ status: "COMPLETED", count: 50, totalAmount: "10000000" }],
      byPaymentMethod: [{ paymentMethod: "CARD", count: 40, totalAmount: "8000000" }],
    };
    mockUseSWR.mockReturnValue({
      data: { data: statsData },
      error: undefined,
      isLoading: false,
    });

    const result = useTransactionStats();
    expect(result.stats).toEqual(statsData);
  });

  it("데이터 없으면 stats=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    const result = useTransactionStats();
    expect(result.stats).toBeNull();
  });
});

// =============================================
// useSettlementStats
// =============================================
describe("useSettlementStats", () => {
  it("쿼리 없이 호출 → /dashboard/settlement-stats key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    useSettlementStats();

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/dashboard/settlement-stats",
      expect.any(Function),
    );
  });

  it("데이터 반환 시 배열 추출", () => {
    const statsArray = [
      { status: "CONFIRMED", count: 20, totalNetAmount: "5000000" },
      { status: "PENDING", count: 5, totalNetAmount: "1000000" },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: statsArray },
      error: undefined,
      isLoading: false,
    });

    const result = useSettlementStats();
    expect(result.stats).toEqual(statsArray);
    expect(result.stats).toHaveLength(2);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    const result = useSettlementStats();
    expect(result.stats).toEqual([]);
  });
});

// =============================================
// useDailyTrend
// =============================================
describe("useDailyTrend", () => {
  it("쿼리 없이 호출 → /dashboard/daily-trend key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    useDailyTrend();

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/dashboard/daily-trend",
      expect.any(Function),
    );
  });

  it("날짜 범위 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    useDailyTrend({ startDate: "2026-02-01", endDate: "2026-02-28" });

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("startDate=2026-02-01");
    expect(key).toContain("endDate=2026-02-28");
  });

  it("데이터 반환 시 배열 추출", () => {
    const trendData = [
      { date: "2026-02-01", count: 10, amount: "1000000" },
      { date: "2026-02-02", count: 15, amount: "1500000" },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: trendData },
      error: undefined,
      isLoading: false,
    });

    const result = useDailyTrend();
    expect(result.trend).toEqual(trendData);
  });
});

// =============================================
// useTopMerchants
// =============================================
describe("useTopMerchants", () => {
  it("쿼리 없이 호출 → /dashboard/top-merchants key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    useTopMerchants();

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/dashboard/top-merchants",
      expect.any(Function),
    );
  });

  it("데이터 반환 시 배열 추출", () => {
    const merchantData = [
      {
        merchantId: "m-1",
        merchantName: "테스트몰",
        merchantCode: "TEST001",
        totalAmount: "50000000",
        transactionCount: 100,
      },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: merchantData },
      error: undefined,
      isLoading: false,
    });

    const result = useTopMerchants();
    expect(result.merchants).toEqual(merchantData);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    const result = useTopMerchants();
    expect(result.merchants).toEqual([]);
  });
});

// =============================================
// useTopAgents
// =============================================
describe("useTopAgents", () => {
  it("쿼리 없이 호출 → /dashboard/top-agents key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    useTopAgents();

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/dashboard/top-agents",
      expect.any(Function),
    );
  });

  it("데이터 반환 시 배열 추출", () => {
    const agentData = [
      {
        agentId: "a-1",
        agentName: "테스트 대리점",
        agentCode: "AGT001",
        totalCommission: "500000",
        settlementCount: 30,
      },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: agentData },
      error: undefined,
      isLoading: false,
    });

    const result = useTopAgents();
    expect(result.agents).toEqual(agentData);
  });

  it("에러 발생 시 isError=true + 빈 배열", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Fetch failed"),
      isLoading: false,
    });

    const result = useTopAgents();
    expect(result.isError).toBe(true);
    expect(result.agents).toEqual([]);
  });
});
