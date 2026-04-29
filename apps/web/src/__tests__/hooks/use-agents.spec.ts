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

import { useAgents, useAgent, useSubAgents } from "@/hooks/use-agents";
import type { AgentQuery } from "@/types/agent";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useAgents — 대리점 목록 조회
// =============================================
describe("useAgents", () => {
  it("쿼리 없이 호출 → /agents key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAgents();

    expect(mockUseSWR).toHaveBeenCalledWith("/agents", expect.any(Function));
  });

  it("page + limit 쿼리 → 쿼리스트링 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: AgentQuery = { page: 3, limit: 15 };
    useAgents(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("page=3");
    expect(key).toContain("limit=15");
  });

  it("search + status + parentAgentId 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: AgentQuery = { search: "테스트", status: "ACTIVE", parentAgentId: "parent-1" };
    useAgents(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("search=");
    expect(key).toContain("status=ACTIVE");
    expect(key).toContain("parentAgentId=parent-1");
  });

  it("데이터 반환 시 agents + meta 추출", () => {
    const agentsData = [
      { id: "a-1", agent_name: "테스트 대리점", agent_code: "AGT001" },
    ];
    const metaData = { total: 30, page: 1, limit: 20, totalPages: 2 };
    mockUseSWR.mockReturnValue({
      data: { data: agentsData, meta: metaData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useAgents();
    expect(result.agents).toEqual(agentsData);
    expect(result.meta).toEqual(metaData);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useAgents();
    expect(result.agents).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("에러 발생 시 isError=true", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Network error"),
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useAgents();
    expect(result.isError).toBe(true);
    expect(result.agents).toEqual([]);
  });
});

// =============================================
// useAgent — 대리점 단건 조회
// =============================================
describe("useAgent", () => {
  it("id 있을 때 → /agents/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAgent("a-123");

    expect(mockUseSWR).toHaveBeenCalledWith("/agents/a-123", expect.any(Function));
  });

  it("id=null → SWR key=null (요청 안 함)", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useAgent(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 agent 추출", () => {
    const agentData = {
      id: "a-1",
      agent_name: "테스트 대리점",
      agent_code: "AGT001",
      status: "ACTIVE",
    };
    mockUseSWR.mockReturnValue({
      data: { data: agentData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useAgent("a-1");
    expect(result.agent).toEqual(agentData);
    expect(result.isLoading).toBe(false);
  });

  it("데이터 없으면 agent=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useAgent("a-1");
    expect(result.agent).toBeNull();
  });
});

// =============================================
// useSubAgents — 하위 대리점 조회
// =============================================
describe("useSubAgents", () => {
  it("id 있을 때 → /agents/{id}/sub-agents key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useSubAgents("a-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/agents/a-1/sub-agents", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useSubAgents(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("데이터 반환 시 subAgents 배열 추출", () => {
    const subAgentsData = [
      { id: "sa-1", agent_name: "하위 대리점A", agent_code: "SUB001", status: "ACTIVE" },
      { id: "sa-2", agent_name: "하위 대리점B", agent_code: "SUB002", status: "SUSPENDED" },
    ];
    mockUseSWR.mockReturnValue({
      data: { data: subAgentsData },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useSubAgents("a-1");
    expect(result.subAgents).toEqual(subAgentsData);
    expect(result.subAgents).toHaveLength(2);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useSubAgents("a-1");
    expect(result.subAgents).toEqual([]);
  });
});
