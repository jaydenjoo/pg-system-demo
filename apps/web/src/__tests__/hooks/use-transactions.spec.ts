import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { useTransactions, useTransaction } from "@/hooks/use-transactions";
import type { TransactionQuery } from "@/types/transaction";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useTransactions — 거래 목록 조회
// =============================================
describe("useTransactions", () => {
  it("쿼리 없이 호출 → /transactions key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useTransactions();

    expect(mockUseSWR).toHaveBeenCalledWith("/transactions", expect.any(Function));
  });

  it("page + limit 쿼리 → 쿼리스트링 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: TransactionQuery = { page: 2, limit: 10 };
    useTransactions(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("page=2");
    expect(key).toContain("limit=10");
  });

  it("복합 쿼리 (merchantId, status, paymentMethod, tranType, 날짜) 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: TransactionQuery = {
      merchantId: "m-1",
      status: "APPROVED",
      paymentMethod: "CARD",
      tranType: "PAYMENT",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    };
    useTransactions(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("merchantId=m-1");
    expect(key).toContain("status=APPROVED");
    expect(key).toContain("paymentMethod=CARD");
    expect(key).toContain("tranType=PAYMENT");
    expect(key).toContain("startDate=2026-01-01");
    expect(key).toContain("endDate=2026-01-31");
  });

  it("데이터 반환 시 transactions + meta 추출", () => {
    const txData = [{ id: "t-1", tran_no: "TRX001", amount: 10000 }];
    const metaData = { total: 50, page: 1, limit: 20, totalPages: 3 };
    mockUseSWR.mockReturnValue({
      data: { data: txData, meta: metaData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useTransactions();
    expect(result.transactions).toEqual(txData);
    expect(result.meta).toEqual(metaData);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useTransactions();
    expect(result.transactions).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Network error"),
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useTransactions();
    expect(result.isError).toBe(true);
    expect(result.transactions).toEqual([]);
  });
});

// =============================================
// useTransaction — 거래 단건 조회
// =============================================
describe("useTransaction", () => {
  it("id 있을 때 → /transactions/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useTransaction("t-123");

    expect(mockUseSWR).toHaveBeenCalledWith("/transactions/t-123", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useTransaction(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});
