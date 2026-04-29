import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import {
  useSettlements,
  useSettlement,
  useAgentSettlements,
  useAgentSettlement,
} from "@/hooks/use-settlements";
import type { SettlementQuery, AgentSettlementQuery } from "@/types/settlement";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useSettlements — 가맹점 정산 목록
// =============================================
describe("useSettlements", () => {
  it("쿼리 없이 호출 → /settlements key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useSettlements();

    expect(mockUseSWR).toHaveBeenCalledWith("/settlements", expect.any(Function));
  });

  it("복합 쿼리 (merchantId, status, 날짜) 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: SettlementQuery = {
      page: 1,
      merchantId: "m-1",
      status: "CONFIRMED",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    };
    useSettlements(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("merchantId=m-1");
    expect(key).toContain("status=CONFIRMED");
    expect(key).toContain("startDate=2026-01-01");
  });

  it("데이터 반환 시 settlements + meta 추출", () => {
    const data = [{ id: "s-1", settlement_date: "2026-01-15", total_amount: 500000 }];
    const meta = { total: 10, page: 1, limit: 20, totalPages: 1 };
    mockUseSWR.mockReturnValue({
      data: { data, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useSettlements();
    expect(result.settlements).toEqual(data);
    expect(result.meta).toEqual(meta);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useSettlements();
    expect(result.settlements).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: new Error("err"), isLoading: false, mutate: vi.fn() });

    expect(useSettlements().isError).toBe(true);
  });
});

// =============================================
// useSettlement — 가맹점 정산 단건
// =============================================
describe("useSettlement", () => {
  it("id 있을 때 → /settlements/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useSettlement("s-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/settlements/s-1", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useSettlement(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 settlement 추출", () => {
    const settlement = { id: "s-1", status: "CONFIRMED", total_amount: 100000 };
    mockUseSWR.mockReturnValue({
      data: { data: settlement },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useSettlement("s-1").settlement).toEqual(settlement);
  });

  it("데이터 없으면 settlement=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useSettlement("s-1").settlement).toBeNull();
  });
});

// =============================================
// useAgentSettlements — 대리점 정산 목록
// =============================================
describe("useAgentSettlements", () => {
  it("쿼리 없이 호출 → /settlements/agents key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAgentSettlements();

    expect(mockUseSWR).toHaveBeenCalledWith("/settlements/agents", expect.any(Function));
  });

  it("agentId + status 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: AgentSettlementQuery = { agentId: "a-1", status: "CALCULATED" };
    useAgentSettlements(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("agentId=a-1");
    expect(key).toContain("status=CALCULATED");
  });

  it("데이터 반환 시 settlements + meta 추출", () => {
    const data = [{ id: "as-1", total_commission: 30000 }];
    const meta = { total: 5, page: 1, limit: 20, totalPages: 1 };
    mockUseSWR.mockReturnValue({
      data: { data, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useAgentSettlements();
    expect(result.settlements).toEqual(data);
    expect(result.meta).toEqual(meta);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useAgentSettlements();
    expect(result.settlements).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });
});

// =============================================
// useAgentSettlement — 대리점 정산 단건
// =============================================
describe("useAgentSettlement", () => {
  it("id 있을 때 → /settlements/agents/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAgentSettlement("as-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/settlements/agents/as-1", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useAgentSettlement(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});
