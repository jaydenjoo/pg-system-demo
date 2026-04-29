import { describe, it, expect, vi, beforeEach } from "vitest";

// SWR 모킹
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

// API 모킹
vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { useMerchants, useMerchant } from "@/hooks/use-merchants";
import type { MerchantQuery } from "@/types/merchant";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useMerchants — 가맹점 목록 조회
// =============================================
describe("useMerchants", () => {
  it("쿼리 없이 호출 → /merchants key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useMerchants();

    expect(mockUseSWR).toHaveBeenCalledWith("/merchants", expect.any(Function));
  });

  it("page + limit 쿼리 → 쿼리스트링 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: MerchantQuery = { page: 2, limit: 10 };
    useMerchants(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("page=2");
    expect(key).toContain("limit=10");
  });

  it("search + status + agentId 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: MerchantQuery = { search: "테스트", status: "ACTIVE", agentId: "agent-1" };
    useMerchants(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("search=");
    expect(key).toContain("status=ACTIVE");
    expect(key).toContain("agentId=agent-1");
  });

  it("데이터 반환 시 merchants + meta 추출", () => {
    const merchantsData = [
      { id: "m-1", merchant_name: "테스트몰", merchant_code: "TEST001" },
    ];
    const metaData = { total: 50, page: 1, limit: 20, totalPages: 3 };
    mockUseSWR.mockReturnValue({
      data: { data: merchantsData, meta: metaData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useMerchants();
    expect(result.merchants).toEqual(merchantsData);
    expect(result.meta).toEqual(metaData);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useMerchants();
    expect(result.merchants).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Network error"),
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useMerchants();
    expect(result.isError).toBe(true);
    expect(result.merchants).toEqual([]);
  });
});

// =============================================
// useMerchant — 가맹점 단건 조회
// =============================================
describe("useMerchant", () => {
  it("id 있을 때 → /merchants/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useMerchant("m-123");

    expect(mockUseSWR).toHaveBeenCalledWith("/merchants/m-123", expect.any(Function));
  });

  it("id=null → SWR key=null (요청 안 함)", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useMerchant(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 merchant 추출", () => {
    const merchantData = {
      id: "m-1",
      merchant_name: "테스트몰",
      merchant_code: "TEST001",
      status: "ACTIVE",
    };
    mockUseSWR.mockReturnValue({
      data: { data: merchantData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useMerchant("m-1");
    expect(result.merchant).toEqual(merchantData);
    expect(result.isLoading).toBe(false);
  });

  it("데이터 없으면 merchant=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useMerchant("m-1");
    expect(result.merchant).toBeNull();
  });
});
