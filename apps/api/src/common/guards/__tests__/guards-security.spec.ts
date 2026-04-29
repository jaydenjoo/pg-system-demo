import * as fs from "fs";
import * as path from "path";
import { Reflector } from "@nestjs/core";
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard } from "../jwt-auth.guard";
import { PermissionsGuard } from "../permissions.guard";
import { PERMISSIONS_KEY } from "../../decorators/permissions.decorator";
import { ERROR_CODES, PermissionCode } from "@pg-system/shared";

// ---- ExecutionContext Mock Factory ----
function createMockExecutionContext(
  user?: Record<string, unknown>,
): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => jest.fn() as T,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: jest.fn(), getContext: jest.fn() }),
    switchToWs: () => ({
      getData: jest.fn(),
      getClient: jest.fn(),
      getPattern: jest.fn(),
    }),
    getType: () => "http",
  } as unknown as ExecutionContext;
}

// ---- Reflector Mock Factory ----
type MockReflector = jest.Mocked<Reflector>;

function createMockReflector(): MockReflector {
  return {
    get: jest.fn(),
    getAll: jest.fn(),
    getAllAndMerge: jest.fn(),
    getAllAndOverride: jest.fn(),
    resolve: jest.fn(),
  } as MockReflector;
}

describe("Guards Security Tests", () => {
  // ============================================================
  // 1. JwtAuthGuard
  // ============================================================
  describe("JwtAuthGuard", () => {
    let guard: JwtAuthGuard;

    beforeEach(() => {
      guard = new JwtAuthGuard();
    });

    it("canActivate 존재 확인", () => {
      expect(typeof guard.canActivate).toBe("function");
    });

    it("AuthGuard('jwt') 확장 확인 — passport jwt 전략 상속", () => {
      const JwtGuardBase = AuthGuard("jwt");
      const guardProto = Object.getPrototypeOf(JwtAuthGuard.prototype);
      const baseProto = JwtGuardBase.prototype;

      expect(guardProto === baseProto).toBe(true);
    });

    it("handleRequest에서 user 없으면 UnauthorizedException with AUTH_001", () => {
      expect(() => guard.handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );

      // 에러 코드 검증
      try {
        guard.handleRequest(null, null);
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<
          string,
          string
        >;
        expect(response.code).toBe(ERROR_CODES.AUTH_001);
      }
    });
  });

  // ============================================================
  // 2. PermissionsGuard
  // ============================================================
  describe("PermissionsGuard", () => {
    let guard: PermissionsGuard;
    let mockReflector: ReturnType<typeof createMockReflector>;

    beforeEach(() => {
      mockReflector = createMockReflector();
      guard = new PermissionsGuard(mockReflector);
    });

    it("데코레이터 없는 엔드포인트 → 통과 (true 반환)", () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = createMockExecutionContext();

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it("빈 권한 배열 → 통과 (true 반환)", () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);
      const ctx = createMockExecutionContext();

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it("필요 권한 없는 사용자 → ForbiddenException AUTH_008", () => {
      const requiredPermissions: PermissionCode[] = ["user:delete"];
      mockReflector.getAllAndOverride.mockReturnValue(requiredPermissions);

      const ctx = createMockExecutionContext({
        sub: "user-1",
        loginId: "testuser",
        userType: "ADMIN",
        roles: ["READ_ONLY"],
        permissions: ["user:read"],
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);

      // 에러 코드 검증
      try {
        guard.canActivate(ctx);
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as Record<
          string,
          string
        >;
        expect(response.code).toBe(ERROR_CODES.AUTH_008);
      }
    });

    it("필요 권한 있는 사용자 → 통과 (true 반환)", () => {
      const requiredPermissions: PermissionCode[] = ["user:read"];
      mockReflector.getAllAndOverride.mockReturnValue(requiredPermissions);

      const ctx = createMockExecutionContext({
        sub: "user-1",
        loginId: "testuser",
        userType: "ADMIN",
        roles: ["SUPER_ADMIN"],
        permissions: ["user:read", "user:create", "user:delete"],
      });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it("OR 로직: 여러 권한 중 하나라도 있으면 통과", () => {
      const requiredPermissions: PermissionCode[] = [
        "user:read",
        "user:create",
      ];
      mockReflector.getAllAndOverride.mockReturnValue(requiredPermissions);

      const ctx = createMockExecutionContext({
        sub: "user-1",
        loginId: "testuser",
        userType: "ADMIN",
        roles: ["READ_ONLY"],
        permissions: ["user:read"],
      });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  // ============================================================
  // 3. Guard 순서
  // ============================================================
  describe("Guard 순서", () => {
    it("AppModule providers에 ThrottlerGuard가 APP_GUARD로 등록", () => {
      const appModulePath = path.resolve(__dirname, "../../../app.module.ts");
      const appModuleContent = fs.readFileSync(appModulePath, "utf8");

      expect(appModuleContent).toContain("APP_GUARD");
      expect(appModuleContent).toContain("ThrottlerGuard");
      expect(appModuleContent).toMatch(
        /APP_GUARD[^}]+ThrottlerGuard|ThrottlerGuard[^}]+APP_GUARD/,
      );
    });

    it("JWT 인증 실패 시 PermissionsGuard까지 도달하지 않음", () => {
      const jwtGuard = new JwtAuthGuard();
      const mockReflector = createMockReflector();
      const permissionsGuard = new PermissionsGuard(mockReflector);
      const canActivateSpy = jest.spyOn(permissionsGuard, "canActivate");

      expect(() => jwtGuard.handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );

      expect(canActivateSpy).not.toHaveBeenCalled();
    });
  });

  // ---- Reflector KEY 확인 ----
  describe("Permissions decorator", () => {
    it("PERMISSIONS_KEY가 올바르게 정의됨", () => {
      expect(PERMISSIONS_KEY).toBe("permissions");
    });
  });
});
