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
  usePgMargins,
  useAgentCommissions,
  useMerchantCommissions,
  useCommissionHistory,
} from "@/hooks/use-commissions";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// usePgMargins — PG 마진 조회
// =============================================
describe("usePgMargins", () => {
  it("/commissions/pg-margins key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    usePgMargins();

    expect(mockUseSWR).toHaveBeenCalledWith("/commissions/pg-margins", expect.any(Function));
  });

  it("데이터 반환 시 margins 배열 추출", () => {
    const margins = [
      { id: "pm-1", payment_method: "CARD", margin_rate: "3.5" },
      { id: "pm-2", payment_method: "BANK_TRANSFER", margin_rate: "1.0" },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: margins },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = usePgMargins();
    expect(result.margins).toEqual(margins);
    expect(result.margins).toHaveLength(2);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(usePgMargins().margins).toEqual([]);
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: new Error("err"), isLoading: false, mutate: vi.fn() });

    expect(usePgMargins().isError).toBe(true);
  });
});

// =============================================
// useAgentCommissions — 대리점 수수료 조회
// =============================================
describe("useAgentCommissions", () => {
  it("agentId 있을 때 → /commissions/agents/{agentId} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAgentCommissions("a-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/commissions/agents/a-1", expect.any(Function));
  });

  it("agentId=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useAgentCommissions(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 commissions 배열 추출", () => {
    const commissions = [{ id: "ac-1", commission_rate: "2.5" }];
    mockUseSWR.mockReturnValue({
      data: { data: commissions },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useAgentCommissions("a-1").commissions).toEqual(commissions);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useAgentCommissions("a-1").commissions).toEqual([]);
  });
});

// =============================================
// useMerchantCommissions — 가맹점 수수료 조회
// =============================================
describe("useMerchantCommissions", () => {
  it("merchantId 있을 때 → /commissions/merchants/{merchantId} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useMerchantCommissions("m-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/commissions/merchants/m-1", expect.any(Function));
  });

  it("merchantId=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useMerchantCommissions(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});

// =============================================
// useCommissionHistory — 수수료 이력 조회
// =============================================
describe("useCommissionHistory", () => {
  it("entityType + entityId 둘 다 있을 때 → 올바른 key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useCommissionHistory("agent", "a-1");

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/commissions/history/agent/a-1",
      expect.any(Function),
    );
  });

  it("entityType=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useCommissionHistory(null, "a-1");

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("entityId=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useCommissionHistory("agent", null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 history 배열 추출", () => {
    const historyData = {
      entityType: "agent",
      entityId: "a-1",
      data: [{ id: "h-1", commission_rate: "2.0" }],
    };
    mockUseSWR.mockReturnValue({
      data: { data: historyData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useCommissionHistory("agent", "a-1").history).toEqual(historyData.data);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useCommissionHistory("agent", "a-1").history).toEqual([]);
  });
});
