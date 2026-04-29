import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

import { useDeposits, useDeposit } from "@/hooks/use-deposits";
import type { DepositQuery } from "@/types/deposit";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useDeposits — 입금 내역 목록
// =============================================
describe("useDeposits", () => {
  it("쿼리 없이 호출 → /deposits key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useDeposits();

    expect(mockUseSWR).toHaveBeenCalledWith("/deposits", expect.any(Function));
  });

  it("복합 쿼리 (source, reconcileStatus, 날짜) 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: DepositQuery = {
      page: 1,
      limit: 50,
      source: "BANK_A",
      reconcileStatus: "PENDING",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    };
    useDeposits(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("source=BANK_A");
    expect(key).toContain("reconcileStatus=PENDING");
    expect(key).toContain("startDate=2026-02-01");
    expect(key).toContain("limit=50");
  });

  it("데이터 반환 시 deposits + meta 추출", () => {
    const deposits = [{ id: "d-1", amount: 1000000, reconcile_status: "MATCHED" }];
    const meta = { total: 100, page: 1, limit: 20, totalPages: 5 };
    mockUseSWR.mockReturnValue({
      data: { data: deposits, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useDeposits();
    expect(result.deposits).toEqual(deposits);
    expect(result.meta).toEqual(meta);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useDeposits();
    expect(result.deposits).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: new Error("err"), isLoading: false, mutate: vi.fn() });

    expect(useDeposits().isError).toBe(true);
  });
});

// =============================================
// useDeposit — 입금 단건 조회
// =============================================
describe("useDeposit", () => {
  it("id 있을 때 → /deposits/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useDeposit("d-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/deposits/d-1", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useDeposit(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 deposit 추출", () => {
    const deposit = { id: "d-1", amount: 500000, reconcile_status: "MATCHED" };
    mockUseSWR.mockReturnValue({
      data: { data: deposit },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useDeposit("d-1").deposit).toEqual(deposit);
  });

  it("데이터 없으면 deposit=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useDeposit("d-1").deposit).toBeNull();
  });
});
