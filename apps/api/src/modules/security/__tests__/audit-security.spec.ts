import { of } from "rxjs";
import { CallHandler, ExecutionContext } from "@nestjs/common";
import {
  AuditInterceptor,
  JwtUser,
  deriveAction,
  deriveResourceType,
  deriveResourceId,
} from "../../../common/interceptors/audit.interceptor";
import {
  SecurityService,
  WriteAuditLogData,
} from "../security.service";

function createMockContext(overrides: {
  method: string;
  url: string;
  ip?: string;
  userAgent?: string;
  user?: JwtUser;
}): ExecutionContext {
  const request = {
    method: overrides.method,
    url: overrides.url,
    ip: overrides.ip ?? "127.0.0.1",
    headers: { "user-agent": overrides.userAgent ?? "test-agent" },
    user: overrides.user,
  };

  const partial: Pick<ExecutionContext, "switchToHttp"> = {
    switchToHttp: () =>
      ({
        getRequest: () => request,
      }) as ReturnType<ExecutionContext["switchToHttp"]>,
  };
  return partial as ExecutionContext;
}

function createMockCallHandler(response: unknown = {}): CallHandler {
  return { handle: () => of(response) };
}

function createMockSecurityService(mockWriteAuditLog: jest.Mock): {
  securityService: SecurityService;
  mockWriteAuditLog: jest.Mock;
} {
  const partial = { writeAuditLog: mockWriteAuditLog };
  return {
    securityService: partial as unknown as SecurityService,
    mockWriteAuditLog,
  };
}

describe("Audit Security Tests", () => {
  let mockWriteAuditLog: jest.Mock;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
    const { securityService } = createMockSecurityService(mockWriteAuditLog);
    interceptor = new AuditInterceptor(securityService);
  });

  // ---- 0. Pure function unit tests ----
  describe("deriveAction", () => {
    it("POST -> CREATE", () => {
      expect(deriveAction("POST")).toBe("CREATE");
    });
    it("PUT -> UPDATE", () => {
      expect(deriveAction("PUT")).toBe("UPDATE");
    });
    it("PATCH -> UPDATE", () => {
      expect(deriveAction("PATCH")).toBe("UPDATE");
    });
    it("DELETE -> DELETE", () => {
      expect(deriveAction("DELETE")).toBe("DELETE");
    });
    it("GET -> READ", () => {
      expect(deriveAction("GET")).toBe("READ");
    });
  });

  describe("deriveResourceType", () => {
    it("/api/v1/users -> USERS", () => {
      expect(deriveResourceType("/api/v1/users")).toBe("USERS");
    });
    it("/api/v1/merchants/123 -> MERCHANTS", () => {
      expect(deriveResourceType("/api/v1/merchants/123")).toBe("MERCHANTS");
    });
    it("/api/v1/settlements?page=1 -> SETTLEMENTS", () => {
      expect(deriveResourceType("/api/v1/settlements?page=1")).toBe(
        "SETTLEMENTS",
      );
    });
  });

  describe("deriveResourceId", () => {
    it("URL에 UUID 포함 시 추출", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(deriveResourceId(`/api/v1/users/${uuid}`)).toBe(uuid);
    });
    it("URL에 UUID 없으면 undefined", () => {
      expect(deriveResourceId("/api/v1/users")).toBeUndefined();
    });
  });

  // ---- 1. AuditInterceptor - writeAuditLog 호출 검증 ----
  describe("AuditInterceptor - action mapping via writeAuditLog", () => {
    it("POST -> CREATE action", (done) => {
      const ctx = createMockContext({
        method: "POST",
        url: "/api/v1/users",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "CREATE" }),
          );
          done();
        },
      });
    });

    it("PUT -> UPDATE action", (done) => {
      const ctx = createMockContext({
        method: "PUT",
        url: "/api/v1/users/550e8400-e29b-41d4-a716-446655440000",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "UPDATE" }),
          );
          done();
        },
      });
    });

    it("DELETE -> DELETE action", (done) => {
      const ctx = createMockContext({
        method: "DELETE",
        url: "/api/v1/users/550e8400-e29b-41d4-a716-446655440000",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "DELETE" }),
          );
          done();
        },
      });
    });

    it("GET -> READ action", (done) => {
      const ctx = createMockContext({
        method: "GET",
        url: "/api/v1/users",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "READ" }),
          );
          done();
        },
      });
    });
  });

  // ---- 2. resourceType & resourceId 전달 검증 ----
  describe("AuditInterceptor - resource fields", () => {
    it("resourceType이 USERS로 전달됨", (done) => {
      const ctx = createMockContext({
        method: "GET",
        url: "/api/v1/users",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ resourceType: "USERS" }),
          );
          done();
        },
      });
    });

    it("UUID 포함 URL에서 resourceId 추출", (done) => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const ctx = createMockContext({
        method: "GET",
        url: `/api/v1/users/${uuid}`,
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ resourceId: uuid }),
          );
          done();
        },
      });
    });

    it("UUID 없는 URL에서 resourceId 미포함", (done) => {
      const ctx = createMockContext({
        method: "GET",
        url: "/api/v1/users",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          const callData = mockWriteAuditLog.mock
            .calls[0][0] as WriteAuditLogData;
          expect(callData).not.toHaveProperty("resourceId");
          done();
        },
      });
    });
  });

  // ---- 3. fire-and-forget ----
  describe("AuditInterceptor - fire-and-forget", () => {
    it("writeAuditLog 실패해도 응답은 정상 반환", (done) => {
      mockWriteAuditLog.mockRejectedValue(new Error("DB write failed"));
      const responseData = { id: "test-123", status: "ok" };

      const ctx = createMockContext({
        method: "POST",
        url: "/api/v1/users",
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor
        .intercept(ctx, createMockCallHandler(responseData))
        .subscribe({
          next: (value) => {
            expect(value).toEqual(responseData);
          },
          complete: () => {
            done();
          },
        });
    });

    it("user 없어도 (anonymous) audit 기록", (done) => {
      const ctx = createMockContext({
        method: "GET",
        url: "/api/v1/users",
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          expect(mockWriteAuditLog).toHaveBeenCalled();
          const callData = mockWriteAuditLog.mock
            .calls[0][0] as WriteAuditLogData;
          expect(callData).not.toHaveProperty("userId");
          done();
        },
      });
    });

    it("user_agent가 500자 초과 시 slice(0, 500)", (done) => {
      const longAgent = "A".repeat(600);
      const ctx = createMockContext({
        method: "GET",
        url: "/api/v1/users",
        userAgent: longAgent,
        user: { sub: "user-1", loginId: "admin", userType: "ADMIN" },
      });

      interceptor.intercept(ctx, createMockCallHandler()).subscribe({
        complete: () => {
          const callData = mockWriteAuditLog.mock
            .calls[0][0] as WriteAuditLogData;
          expect(callData.userAgent?.length).toBeLessThanOrEqual(500);
          done();
        },
      });
    });
  });
});
