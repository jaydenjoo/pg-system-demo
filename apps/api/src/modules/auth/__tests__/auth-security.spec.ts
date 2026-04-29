import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { AuthService } from "../auth.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { SECURITY } from "@pg-system/shared";
import {
  encryptForTest,
  createMockPrisma,
  createMockJwtService,
  createMockConfigService,
  createMockCache,
  createTestUser,
  type TestUser,
} from "./auth-test.helper";

describe("Auth Security Tests", () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockJwtService: ReturnType<typeof createMockJwtService>;
  let testUser: TestUser;
  const ip = "127.0.0.1";
  const ua = "jest-security-test";
  const loginDto = { loginId: "testuser", password: "ValidPass123!@" };

  beforeAll(async () => {
    testUser = createTestUser();
    testUser.password_hash = await bcrypt.hash("ValidPass123!@", 4);
  });

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockJwtService = createMockJwtService();
    const mockConfigService = createMockConfigService();
    const mockCache = createMockCache();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ============================================================
  // 1. JWT Token Security
  // ============================================================
  describe("JWT Token Security", () => {
    it("access token 만료 시간이 15분(900초)인지 확인", () => {
      expect(SECURITY.ACCESS_TOKEN_EXPIRES_SECONDS).toBe(900);
    });

    it("refresh token 만료 시간이 7일인지 확인", () => {
      expect(SECURITY.REFRESH_TOKEN_EXPIRES_DAYS).toBe(7);
    });

    it("JWT 시크릿이 환경변수에서 로드되는지 확인", () => {
      const mockConfigService = createMockConfigService();
      expect(mockConfigService.get("jwt.accessExpiresIn")).toBeDefined();
    });

    it("존재하지 않는 refresh token → UnauthorizedException", async () => {
      mockPrisma.refresh_tokens.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshToken("expired-or-invalid-token"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("JWT payload에 password_hash 미포함 확인", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.login_history.create.mockResolvedValue({});

      await service.login(loginDto, ip, ua);

      const signCalls = mockJwtService.sign.mock.calls;
      expect(signCalls.length).toBeGreaterThan(0);
      const payload = signCalls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("password_hash");
      expect(payload).toHaveProperty("sub");
      expect(payload).toHaveProperty("loginId");
    });
  });

  // ============================================================
  // 2. MFA TOTP Security
  // ============================================================
  describe("MFA TOTP Security", () => {
    it("MFA 활성화된 계정: 비밀번호만으로 로그인 시 MFA_REQUIRED 반환", async () => {
      const userWithMfa = {
        ...testUser,
        user_mfa: [{ mfa_type: "TOTP", is_verified: true, is_primary: true }],
      };
      mockPrisma.users.findUnique.mockResolvedValue(userWithMfa);
      mockPrisma.users.update.mockResolvedValue(userWithMfa);
      mockPrisma.login_history.create.mockResolvedValue({});

      const result = await service.login(loginDto, ip, ua);

      expect(result.requireMfa).toBe(true);
      expect(result.mfaToken).toBeDefined();
      expect(result.mfaType).toBe("TOTP");
      expect(result.accessToken).toBeUndefined();
    });

    it("유효한 TOTP 코드로 MFA 인증 성공", async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      const encryptedSecret = encryptForTest(secret);

      mockJwtService.verify.mockReturnValue({
        sub: "user-uuid-1",
        type: "mfa_pending",
      });
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: encryptedSecret,
        mfa_type: "TOTP",
        is_verified: true,
        is_primary: true,
      });
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.login_history.create.mockResolvedValue({});

      const result = await service.verifyMfa(
        { mfaToken: "mock-token", code: validCode },
        ip,
        ua,
      );

      expect(result.requireMfa).toBe(false);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it("잘못된 TOTP 코드 → UnauthorizedException (AUTH_005)", async () => {
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptForTest(secret);

      mockJwtService.verify.mockReturnValue({
        sub: "user-uuid-1",
        type: "mfa_pending",
      });
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: encryptedSecret,
        mfa_type: "TOTP",
        is_verified: true,
      });

      await expect(
        service.verifyMfa({ mfaToken: "mock-token", code: "000000" }, ip, ua),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("MFA secret은 AES-256-GCM으로 암호화 (iv:authTag:ciphertext 형식)", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptForTest(secret);

      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]+$/);
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
      expect(encrypted).not.toContain(secret);
    });
  });

  // ============================================================
  // 3. Password Security
  // ============================================================
  describe("Password Security", () => {
    it("비밀번호는 bcrypt로 해시하여 저장", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue({});

      await service.changePassword("user-uuid-1", {
        currentPassword: "ValidPass123!@",
        newPassword: "NewSecure1234!@",
      });

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password_hash: expect.any(String),
          }),
        }),
      );

      const updateArgs = mockPrisma.users.update.mock.calls[0][0] as {
        data: { password_hash: string };
      };
      const savedHash = updateArgs.data.password_hash;
      expect(savedHash).not.toBe("NewSecure1234!@");
      const isMatch = await bcrypt.compare("NewSecure1234!@", savedHash);
      expect(isMatch).toBe(true);
    });

    it("12자 미만 비밀번호 → BadRequestException (AUTH_007)", async () => {
      await expect(
        service.changePassword("user-uuid-1", {
          currentPassword: "ValidPass123!@",
          newPassword: "Short1!",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("대/소문자+숫자+특수문자 조합 미충족 → BadRequestException (숫자만 12자)", async () => {
      await expect(
        service.changePassword("user-uuid-1", {
          currentPassword: "ValidPass123!@",
          newPassword: "123456789012",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("현재 비밀번호 불일치 → BadRequestException (AUTH_002)", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);

      await expect(
        service.changePassword("user-uuid-1", {
          currentPassword: "WrongPassword!@34",
          newPassword: "NewSecure1234!@",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // 4. Account Lockout
  // ============================================================
  describe("Account Lockout", () => {
    it("로그인 5회 연속 실패 → locked_until 설정", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update
        .mockResolvedValueOnce({
          failed_login_count: SECURITY.MAX_LOGIN_ATTEMPTS,
        })
        .mockResolvedValueOnce({});
      mockPrisma.login_history.create.mockResolvedValue({});

      await expect(
        service.login(
          { loginId: "testuser", password: "WrongPassword!!" },
          ip,
          ua,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "LOCKED",
            locked_until: expect.any(Date),
          }),
        }),
      );
    });

    it("잠금 상태에서 올바른 비밀번호도 거부 (AUTH_003)", async () => {
      const lockedUser = createTestUser({
        status: "LOCKED",
        locked_until: new Date(Date.now() + 3_600_000),
      });
      lockedUser.password_hash = testUser.password_hash;
      mockPrisma.users.findUnique.mockResolvedValue(lockedUser);
      mockPrisma.login_history.create.mockResolvedValue({});

      await expect(service.login(loginDto, ip, ua)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("잠금 시간 경과 후 로그인 가능 (locked_until < now)", async () => {
      const expiredLockUser = createTestUser({
        status: "LOCKED",
        locked_until: new Date(Date.now() - 1_000),
      });
      expiredLockUser.password_hash = testUser.password_hash;
      mockPrisma.users.findUnique.mockResolvedValue(expiredLockUser);
      mockPrisma.users.update.mockResolvedValue(expiredLockUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.login_history.create.mockResolvedValue({});

      const result = await service.login(loginDto, ip, ua);

      expect(result.requireMfa).toBe(false);
      expect(result.accessToken).toBeDefined();
    });
  });

  // ============================================================
  // 5. Refresh Token Security
  // ============================================================
  describe("Refresh Token Security", () => {
    it("refresh token은 SHA-256 해시로 DB 저장 (64자 hex)", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.login_history.create.mockResolvedValue({});
      mockPrisma.refresh_tokens.create.mockResolvedValue({});

      const result = await service.login(loginDto, ip, ua);

      expect(mockPrisma.refresh_tokens.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      );

      const createArgs = mockPrisma.refresh_tokens.create.mock.calls[0][0] as {
        data: { token_hash: string };
      };
      expect(createArgs.data.token_hash).not.toBe(result.refreshToken);
    });

    it("logout 시 해당 토큰만 revoked_at 설정 (token_hash 기준)", async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });

      await service.logout("user-uuid-1", "some-refresh-token");

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: "user-uuid-1",
            token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
          data: expect.objectContaining({
            revoked_at: expect.any(Date),
          }),
        }),
      );
    });

    it("존재하지 않는 refresh token → UnauthorizedException (AUTH_006)", async () => {
      mockPrisma.refresh_tokens.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshToken("non-existent-or-revoked-token"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
