import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { AuthService } from "../auth.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  encryptForTest,
  createMockPrisma,
  createMockJwtService,
  createMockConfigService,
  createMockCache,
  createTestUser,
  type TestUser,
} from "./auth-test.helper";

describe("AuthService", () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockJwtService: ReturnType<typeof createMockJwtService>;
  let testUser: TestUser;

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
  // login()
  // ============================================================
  describe("login", () => {
    const loginDto = { loginId: "testuser", password: "ValidPass123!@" };
    const ip = "127.0.0.1";
    const ua = "jest-test-agent";

    it("should return tokens on valid login without MFA", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.login_history.create.mockResolvedValue({});

      const result = await service.login(loginDto, ip, ua);

      expect(result.requireMfa).toBe(false);
      expect(result.accessToken).toBeDefined();
      expect(mockPrisma.login_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: testUser.id,
            login_result: "SUCCESS",
            ip_address: ip,
          }),
        }),
      );
    });

    it("should throw UnauthorizedException for invalid credentials", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto, ip, ua)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for wrong password and use atomic increment", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue({ failed_login_count: 1 });
      mockPrisma.login_history.create.mockResolvedValue({});

      await expect(
        service.login({ loginId: "testuser", password: "WrongPass!!" }, ip, ua),
      ).rejects.toThrow(UnauthorizedException);

      // Verify atomic increment pattern
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testUser.id },
          data: { failed_login_count: { increment: 1 } },
          select: { failed_login_count: true },
        }),
      );

      expect(mockPrisma.login_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ login_result: "FAILED" }),
        }),
      );
    });

    it("should throw for locked account", async () => {
      const lockedUser = {
        ...testUser,
        status: "LOCKED",
        locked_until: new Date(Date.now() + 3600000),
      };
      mockPrisma.users.findUnique.mockResolvedValue(lockedUser);
      mockPrisma.login_history.create.mockResolvedValue({});

      await expect(service.login(loginDto, ip, ua)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should return requireMfa=true when MFA is active", async () => {
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
      expect(mockPrisma.login_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ login_result: "MFA_PENDING" }),
        }),
      );
    });

    it("should still succeed if recordLoginHistory throws", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.login_history.create.mockRejectedValue(
        new Error("DB connection lost"),
      );

      // Login should NOT throw even though login_history.create fails
      const result = await service.login(loginDto, ip, ua);
      expect(result.requireMfa).toBe(false);
      expect(result.accessToken).toBeDefined();
    });
  });

  // ============================================================
  // verifyMfa()
  // ============================================================
  describe("verifyMfa", () => {
    const ip = "127.0.0.1";
    const ua = "jest-test-agent";

    it("should return tokens on valid MFA code (with encrypted secret)", async () => {
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
      expect(mockPrisma.login_history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            login_result: "SUCCESS",
            mfa_type: "TOTP",
          }),
        }),
      );
    });

    it("should throw on expired mfa token", async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("expired");
      });

      await expect(
        service.verifyMfa({ mfaToken: "expired", code: "123456" }, ip, ua),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw on invalid MFA code", async () => {
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

    it("should throw InternalServerErrorException if MFA decryption fails", async () => {
      mockJwtService.verify.mockReturnValue({
        sub: "user-uuid-1",
        type: "mfa_pending",
      });
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: "invalid-not-encrypted-data",
        mfa_type: "TOTP",
        is_verified: true,
        is_primary: true,
      });

      await expect(
        service.verifyMfa({ mfaToken: "mock-token", code: "123456" }, ip, ua),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ============================================================
  // setupMfa()
  // ============================================================
  describe("setupMfa", () => {
    it("should return secret and base64 QR code (storing encrypted secret)", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);
      mockPrisma.user_mfa.findUnique.mockResolvedValue(null);
      mockPrisma.user_mfa.upsert.mockResolvedValue({});

      const result = await service.setupMfa("user-uuid-1");

      expect(result.secret).toBeDefined();
      expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/);

      // Verify that the stored secret is encrypted (not plaintext)
      const upsertCall = mockPrisma.user_mfa.upsert.mock.calls[0][0];
      const storedSecret = upsertCall.create.secret_key;
      expect(storedSecret).toContain(":"); // iv:authTag:ciphertext format
      expect(storedSecret).not.toBe(result.secret); // Not stored as plaintext
    });

    it("should throw if MFA already verified", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        is_verified: true,
      });

      await expect(service.setupMfa("user-uuid-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============================================================
  // enableMfa()
  // ============================================================
  describe("enableMfa", () => {
    it("should enable MFA with valid code (decrypting secret)", async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      const encryptedSecret = encryptForTest(secret);

      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: encryptedSecret,
        is_verified: false,
      });
      mockPrisma.user_mfa.update.mockResolvedValue({});

      await service.enableMfa("user-uuid-1", { code: validCode });

      expect(mockPrisma.user_mfa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_verified: true, is_primary: true },
        }),
      );
    });

    it("should throw for invalid code", async () => {
      const secret = authenticator.generateSecret();
      const encryptedSecret = encryptForTest(secret);

      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: encryptedSecret,
        is_verified: false,
      });

      await expect(
        service.enableMfa("user-uuid-1", { code: "000000" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw if no MFA setup", async () => {
      mockPrisma.user_mfa.findUnique.mockResolvedValue(null);

      await expect(
        service.enableMfa("user-uuid-1", { code: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw if already enabled", async () => {
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: "secret",
        is_verified: true,
      });

      await expect(
        service.enableMfa("user-uuid-1", { code: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw InternalServerErrorException if decryption fails during enable", async () => {
      mockPrisma.user_mfa.findUnique.mockResolvedValue({
        secret_key: "corrupted-data",
        is_verified: false,
      });

      await expect(
        service.enableMfa("user-uuid-1", { code: "123456" }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ============================================================
  // changePassword()
  // ============================================================
  describe("changePassword", () => {
    it("should change password with valid current password", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue({});

      await service.changePassword("user-uuid-1", {
        currentPassword: "ValidPass123!@",
        newPassword: "NewSecure1234!@",
      });

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-uuid-1" },
        }),
      );
    });

    it("should throw for wrong current password", async () => {
      mockPrisma.users.findUniqueOrThrow.mockResolvedValue(testUser);

      await expect(
        service.changePassword("user-uuid-1", {
          currentPassword: "WrongPassword!",
          newPassword: "NewSecure1234!@",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw for weak new password", async () => {
      await expect(
        service.changePassword("user-uuid-1", {
          currentPassword: "ValidPass123!@",
          newPassword: "weak",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // logout()
  // ============================================================
  describe("logout", () => {
    it("should revoke refresh token", async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });

      await service.logout("user-uuid-1", "some-refresh-token");

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: "user-uuid-1" }),
          data: expect.objectContaining({ revoked_at: expect.any(Date) }),
        }),
      );
    });

    it("should not throw when no matching token found (graceful logout)", async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.logout("user-uuid-1", "non-existent-token"),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // refreshToken()
  // ============================================================
  describe("refreshToken", () => {
    it("should throw when user is inactive", async () => {
      mockPrisma.refresh_tokens.findUnique.mockResolvedValue({
        user_id: "user-uuid-1",
        users: { ...testUser, status: "LOCKED" },
      });

      await expect(service.refreshToken("valid-refresh-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw when token not found", async () => {
      mockPrisma.refresh_tokens.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken("invalid-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ============================================================
  // issueTokens() — refresh token creation failure
  // ============================================================
  describe("issueTokens (via login)", () => {
    it("should throw InternalServerErrorException if refresh token creation fails", async () => {
      mockPrisma.users.findUnique.mockResolvedValue(testUser);
      mockPrisma.users.update.mockResolvedValue(testUser);
      mockPrisma.user_roles.findMany.mockResolvedValue([]);
      mockPrisma.login_history.create.mockResolvedValue({});
      mockPrisma.refresh_tokens.create.mockRejectedValue(
        new Error("DB write failed"),
      );

      await expect(
        service.login(
          { loginId: "testuser", password: "ValidPass123!@" },
          "127.0.0.1",
          "jest",
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
