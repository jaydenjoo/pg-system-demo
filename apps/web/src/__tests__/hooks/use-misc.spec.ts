import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { useUsers, useUserById } from "@/hooks/use-users";
import { useRoles, useRole } from "@/hooks/use-roles";
import { usePermissions } from "@/hooks/use-permissions";
import { useUser } from "@/hooks/use-user";
import { useAuditLogs, useRiskAlerts, useLoginHistory } from "@/hooks/use-security";
import {
  useSystemCodes,
  useSystemCodesByGroup,
  useHolidays,
  useMenus,
  useNotifications,
} from "@/hooks/use-system";
import type { UserListQuery } from "@/types/user";
import type { AuditLogQuery, RiskAlertQuery, LoginHistoryQuery } from "@/types/security";

beforeEach(() => {
  mockUseSWR.mockReset();
});

// =============================================
// useUsers — 사용자 목록
// =============================================
describe("useUsers", () => {
  it("쿼리 없이 호출 → /users key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useUsers();

    expect(mockUseSWR).toHaveBeenCalledWith("/users", expect.any(Function));
  });

  it("search + userType + status 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: UserListQuery = { search: "admin", userType: "ADMIN", status: "ACTIVE" };
    useUsers(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("search=admin");
    expect(key).toContain("userType=ADMIN");
    expect(key).toContain("status=ACTIVE");
  });

  it("데이터 반환 시 users + meta 추출", () => {
    const users = [{ id: "u-1", name: "관리자" }];
    const meta = { total: 1, page: 1, limit: 20, totalPages: 1 };
    mockUseSWR.mockReturnValue({
      data: { data: users, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useUsers();
    expect(result.users).toEqual(users);
    expect(result.meta).toEqual(meta);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useUsers();
    expect(result.users).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });
});

// =============================================
// useUserById — 사용자 단건
// =============================================
describe("useUserById", () => {
  it("id 있을 때 → /users/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useUserById("u-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/users/u-1", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useUserById(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});

// useAssignRoles — useState 사용 (하이브리드 훅) → node 환경 테스트 불가, 제외

// =============================================
// useRoles — 역할 목록
// =============================================
describe("useRoles", () => {
  it("/roles key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useRoles();

    expect(mockUseSWR).toHaveBeenCalledWith("/roles", expect.any(Function));
  });

  it("데이터 반환 시 roles 배열 추출", () => {
    const roles = [{ id: "r-1", name: "Admin" }];
    mockUseSWR.mockReturnValue({
      data: { data: roles },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useRoles().roles).toEqual(roles);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useRoles().roles).toEqual([]);
  });
});

// =============================================
// useRole — 역할 단건
// =============================================
describe("useRole", () => {
  it("id 있을 때 → /roles/{id} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useRole("r-1");

    expect(mockUseSWR).toHaveBeenCalledWith("/roles/r-1", expect.any(Function));
  });

  it("id=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useRole(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});

// =============================================
// usePermissions — 권한 목록
// =============================================
describe("usePermissions", () => {
  it("/permissions key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    usePermissions();

    expect(mockUseSWR).toHaveBeenCalledWith("/permissions", expect.any(Function));
  });

  it("데이터 반환 시 permissions 배열 추출", () => {
    const perms = [{ id: "p-1", action: "READ", resource: "USERS" }];
    mockUseSWR.mockReturnValue({
      data: { data: perms },
      error: undefined,
      isLoading: false,
    });

    expect(usePermissions().permissions).toEqual(perms);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });

    expect(usePermissions().permissions).toEqual([]);
  });
});

// =============================================
// useUser — 내 정보 조회
// =============================================
describe("useUser", () => {
  it("/users/me key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useUser();

    expect(mockUseSWR).toHaveBeenCalledWith("/users/me", expect.any(Function));
  });

  it("데이터 반환 시 user 추출", () => {
    const user = { id: "u-1", name: "Jayden", login_id: "jayden" };
    mockUseSWR.mockReturnValue({
      data: { data: user },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useUser().user).toEqual(user);
  });

  it("데이터 없으면 user=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useUser().user).toBeNull();
  });
});

// =============================================
// useAuditLogs — 감사 로그
// =============================================
describe("useAuditLogs", () => {
  it("쿼리 없이 호출 → /security/audit-logs key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useAuditLogs();

    expect(mockUseSWR).toHaveBeenCalledWith("/security/audit-logs", expect.any(Function));
  });

  it("userId + action + resourceType 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: AuditLogQuery = { userId: "u-1", action: "LOGIN", resourceType: "USER" };
    useAuditLogs(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("userId=u-1");
    expect(key).toContain("action=LOGIN");
    expect(key).toContain("resourceType=USER");
  });

  it("데이터 반환 시 logs + meta 추출", () => {
    const logs = [{ id: "al-1", action: "LOGIN" }];
    const meta = { total: 100, page: 1, limit: 20, totalPages: 5 };
    mockUseSWR.mockReturnValue({
      data: { data: logs, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useAuditLogs();
    expect(result.logs).toEqual(logs);
    expect(result.meta).toEqual(meta);
  });

  it("데이터 없으면 빈 배열 + 기본 meta", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const result = useAuditLogs();
    expect(result.logs).toEqual([]);
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });
});

// =============================================
// useRiskAlerts — 위험 알림
// =============================================
describe("useRiskAlerts", () => {
  it("쿼리 없이 호출 → /security/risk-alerts key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useRiskAlerts();

    expect(mockUseSWR).toHaveBeenCalledWith("/security/risk-alerts", expect.any(Function));
  });

  it("severity + resolved 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: RiskAlertQuery = { severity: "HIGH", resolved: false };
    useRiskAlerts(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("severity=HIGH");
    expect(key).toContain("resolved=false");
  });

  it("데이터 반환 시 alerts + meta 추출", () => {
    const alerts = [{ id: "ra-1", severity: "HIGH", description: "의심 거래" }];
    const meta = { total: 3, page: 1, limit: 20, totalPages: 1 };
    mockUseSWR.mockReturnValue({
      data: { data: alerts, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useRiskAlerts();
    expect(result.alerts).toEqual(alerts);
    expect(result.meta).toEqual(meta);
  });
});

// =============================================
// useLoginHistory — 로그인 이력
// =============================================
describe("useLoginHistory", () => {
  it("쿼리 없이 호출 → /security/login-history key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useLoginHistory();

    expect(mockUseSWR).toHaveBeenCalledWith("/security/login-history", expect.any(Function));
  });

  it("userId + result 쿼리 포함", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    const query: LoginHistoryQuery = { userId: "u-1", result: "SUCCESS" };
    useLoginHistory(query);

    const key = mockUseSWR.mock.calls[0][0] as string;
    expect(key).toContain("userId=u-1");
    expect(key).toContain("result=SUCCESS");
  });

  it("데이터 반환 시 history + meta 추출", () => {
    const history = [{ id: "lh-1", login_result: "SUCCESS", ip_address: "1.2.3.4" }];
    const meta = { total: 50, page: 1, limit: 20, totalPages: 3 };
    mockUseSWR.mockReturnValue({
      data: { data: history, meta },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const result = useLoginHistory();
    expect(result.history).toEqual(history);
    expect(result.meta).toEqual(meta);
  });
});

// =============================================
// useSystemCodes — 시스템 코드 전체
// =============================================
describe("useSystemCodes", () => {
  it("/system/codes key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useSystemCodes();

    expect(mockUseSWR).toHaveBeenCalledWith("/system/codes", expect.any(Function));
  });

  it("데이터 반환 시 codes 배열 추출", () => {
    const codes = [{ id: "sc-1", group_code: "PAY_METHOD", code: "CARD", name: "카드" }];
    mockUseSWR.mockReturnValue({
      data: { data: codes },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useSystemCodes().codes).toEqual(codes);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useSystemCodes().codes).toEqual([]);
  });
});

// =============================================
// useSystemCodesByGroup — 그룹별 시스템 코드
// =============================================
describe("useSystemCodesByGroup", () => {
  it("groupCode 있을 때 → /system/codes/group/{groupCode} key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useSystemCodesByGroup("PAY_METHOD");

    expect(mockUseSWR).toHaveBeenCalledWith("/system/codes/group/PAY_METHOD", expect.any(Function));
  });

  it("groupCode=null → SWR key=null", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    useSystemCodesByGroup(null);

    expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function));
  });
});

// =============================================
// useHolidays — 공휴일 목록
// =============================================
describe("useHolidays", () => {
  it("/system/holidays key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useHolidays();

    expect(mockUseSWR).toHaveBeenCalledWith("/system/holidays", expect.any(Function));
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useHolidays().holidays).toEqual([]);
  });
});

// =============================================
// useMenus — 메뉴 트리
// =============================================
describe("useMenus", () => {
  it("/system/menus key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useMenus();

    expect(mockUseSWR).toHaveBeenCalledWith("/system/menus", expect.any(Function));
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useMenus().menus).toEqual([]);
  });
});

// =============================================
// useNotifications — 알림 목록
// =============================================
describe("useNotifications", () => {
  it("/system/notifications key 사용", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });

    useNotifications();

    expect(mockUseSWR).toHaveBeenCalledWith("/system/notifications", expect.any(Function));
  });

  it("데이터 반환 시 notifications 배열 추출", () => {
    const notifications = [{ id: "n-1", title: "공지", content: "시스템 점검" }];
    mockUseSWR.mockReturnValue({
      data: { data: notifications },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    expect(useNotifications().notifications).toEqual(notifications);
  });

  it("데이터 없으면 빈 배열", () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() });

    expect(useNotifications().notifications).toEqual([]);
  });
});
