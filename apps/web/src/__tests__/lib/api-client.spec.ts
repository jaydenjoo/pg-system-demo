import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, apiGet, apiPost, apiPut, apiDelete, ApiClientError } from "@/lib/api-client";

// global fetch 모킹
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

// =============================================
// apiFetch — 기본 HTTP 래퍼
// =============================================
describe("apiFetch", () => {
  it("성공 응답 → JSON 파싱 반환", async () => {
    const body = { data: { id: 1 } };
    mockFetch.mockResolvedValue(jsonResponse(body));

    const result = await apiFetch("/test");

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/test"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("204 No Content → undefined 반환", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as unknown as Response);

    const result = await apiFetch("/test");
    expect(result).toBeUndefined();
  });

  it("에러 응답 → ApiClientError throw", async () => {
    const errorBody = { error: { code: "NOT_FOUND", message: "리소스 없음" } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 404));

    await expect(apiFetch("/test")).rejects.toThrow(ApiClientError);

    try {
      await apiFetch("/test");
    } catch (e) {
      const err = e as ApiClientError;
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toBe("리소스 없음");
      expect(err.status).toBe(404);
    }
  });

  it("JSON 파싱 실패 → UNKNOWN 코드로 ApiClientError", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("invalid json")),
      headers: new Headers(),
    } as unknown as Response);

    await expect(apiFetch("/test")).rejects.toThrow(ApiClientError);

    try {
      await apiFetch("/test");
    } catch (e) {
      const err = e as ApiClientError;
      expect(err.code).toBe("UNKNOWN");
    }
  });

  it("401 응답 → /login 리다이렉트 (브라우저)", async () => {
    // node 환경에서 window 시뮬레이션
    const fakeWindow = { location: { href: "" } } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", fakeWindow);

    const errorBody = { error: { code: "UNAUTHORIZED", message: "인증 필요" } };
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 401));

    await expect(apiFetch("/test")).rejects.toThrow(ApiClientError);
    expect(fakeWindow.location.href).toBe("/login");

    vi.unstubAllGlobals();
    // fetch 재등록 (unstub이 전체 글로벌 초기화하므로)
    vi.stubGlobal("fetch", mockFetch);
  });

  it("커스텀 헤더 전달", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: null }));

    await apiFetch("/test", {
      headers: { "X-Custom": "value" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom": "value",
        }),
      }),
    );
  });
});

// =============================================
// apiGet / apiPost / apiPut / apiDelete
// =============================================
describe("apiGet", () => {
  it("GET 요청 → ApiResponse 반환", async () => {
    const body = { data: { items: [] } };
    mockFetch.mockResolvedValue(jsonResponse(body));

    const result = await apiGet("/merchants");
    expect(result).toEqual(body);
  });
});

describe("apiPost", () => {
  it("POST 요청 + JSON body 전송", async () => {
    const body = { data: { id: "new-1" } };
    mockFetch.mockResolvedValue(jsonResponse(body));

    const payload = { name: "테스트 가맹점" };
    const result = await apiPost("/merchants", payload);

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });
});

describe("apiPut", () => {
  it("PUT 요청 + JSON body 전송", async () => {
    const body = { data: { id: "1", name: "수정됨" } };
    mockFetch.mockResolvedValue(jsonResponse(body));

    const payload = { name: "수정됨" };
    const result = await apiPut("/merchants/1", payload);

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    );
  });
});

describe("apiDelete", () => {
  it("DELETE 요청", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as unknown as Response);

    await apiDelete("/merchants/1");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
