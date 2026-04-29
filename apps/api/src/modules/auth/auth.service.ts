import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CACHE_TTL,
  ERROR_CODES,
  SECURITY,
  validatePasswordPolicy,
} from "@pg-system/shared";
import { LoginDto } from "./dto/login.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { MfaEnableDto } from "./dto/mfa-setup.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import * as crypto from "crypto";

/** MFA 설정 결과 — TOTP 시크릿과 QR코드 Data URL을 반환. */
export interface MfaSetupResult {
  secret: string;
  qrCodeUrl: string;
}

/** 로그인 이력 기록 입력 — PCI DSS 10.2 감사 추적용. */
interface LoginHistoryInput {
  userId: string;
  loginResult: "SUCCESS" | "FAILED" | "MFA_PENDING";
  ipAddress: string;
  userAgent: string | null;
  mfaType: string | null;
}

const VALID_USER_TYPES = new Set<JwtPayload["userType"]>([
  "ADMIN",
  "AGENT",
  "MERCHANT",
]);

function isValidUserType(value: string): value is JwtPayload["userType"] {
  return VALID_USER_TYPES.has(value as JwtPayload["userType"]);
}

/**
 * 로그인 결과 타입 — MFA 필요 여부에 따라 두 가지 형태:
 * - MFA 필요: { requireMfa: true, mfaToken, mfaType }
 * - MFA 불필요/완료: { requireMfa: false, accessToken, refreshToken, expiresIn }
 */
export interface LoginResult {
  requireMfa: boolean;
  /** PCI DSS 8.3.1 — 첫 로그인 시 비밀번호 변경 강제 */
  mustChangePassword?: boolean;
  userType?: "ADMIN" | "AGENT" | "MERCHANT";
  mfaToken?: string;
  mfaType?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * @description 인증(Auth) 서비스. 로그인, MFA 인증, 토큰 발급/갱신/폐기, 비밀번호 변경 등 전체 인증 플로우 관리.
 *
 * 인증 플로우:
 * 1. login() → 비밀번호 검증 → MFA 설정 여부 확인
 *    - MFA 없음: 즉시 access/refresh 토큰 발급
 *    - MFA 있음: mfa_pending 임시 토큰 발급 → verifyMfa()로 TOTP 검증 후 토큰 발급
 * 2. refreshToken() → access 토큰 갱신 (refresh 토큰 SHA-256 해시 비교)
 * 3. logout() → refresh 토큰 폐기
 *
 * @security PCI DSS 8.x (Identification and Authentication) 전면 준수
 * - 8.2.8: 세션 고정 방지 (로그인 시 기존 refresh 토큰 전체 폐기)
 * - 8.3.4: 계정 잠금 (5회 실패 → 30분 잠금)
 * - 8.3.6: bcrypt 12라운드 비밀번호 해싱
 * - 8.4.2: MFA(TOTP) 지원
 * @security PCI DSS 3.5.1 - MFA 시크릿 AES-256-GCM 암호화 저장
 * @audit PCI DSS 10.2 - 모든 인증 시도(성공/실패/MFA) 이력 기록
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly mfaEncryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    const keyHex = this.config.getOrThrow<string>("encryption.mfaSecretKey");
    this.mfaEncryptionKey = Buffer.from(keyHex, "hex");
    if (this.mfaEncryptionKey.length !== 32) {
      throw new Error(
        "MFA encryption key must be 32 bytes (64 hex characters)",
      );
    }
  }

  /**
   * MFA 시크릿 암호화 — AES-256-GCM. 랜덤 12바이트 IV 생성 후 암호화.
   * 저장 형식: `iv:authTag:ciphertext` (모두 hex 인코딩)
   * @security PCI DSS 3.5.1 - 암호화 키로 민감 데이터 보호
   */
  private encryptMfaSecret(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.mfaEncryptionKey,
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  /** MFA 시크릿 복호화 — AES-256-GCM. authTag 검증으로 무결성 보장. */
  private decryptMfaSecret(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted MFA secret format");
    }
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.mfaEncryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  /**
   * @description 로그인 처리. 비밀번호 검증 → 계정 잠금 확인 → MFA 분기 → 토큰 발급.
   * @param {LoginDto} dto - 로그인ID, 비밀번호
   * @param {string} ipAddress - 요청 IP (감사 로그용)
   * @param {string|null} userAgent - 브라우저 정보 (감사 로그용)
   * @returns {Promise<LoginResult>} MFA 필요 시 mfaToken, 아니면 access/refresh 토큰
   * @security PCI DSS 8.3.4 - 5회 실패 시 30분 계정 잠금
   * @audit 모든 로그인 시도 이력 기록 (성공/실패/MFA_PENDING)
   */
  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<LoginResult> {
    const user = await this.prisma.users.findUnique({
      where: { login_id: dto.loginId, deleted_at: null },
      include: { user_mfa: { where: { is_primary: true } } },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_002,
        message: "아이디 또는 비밀번호가 올바르지 않습니다",
      });
    }

    if (
      user.status === "LOCKED" &&
      user.locked_until &&
      user.locked_until > new Date()
    ) {
      await this.safeRecordLoginHistory({
        userId: user.id,
        loginResult: "FAILED",
        ipAddress,
        userAgent,
        mfaType: null,
      });
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_003,
        message: "계정이 잠겼습니다",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id);
      await this.safeRecordLoginHistory({
        userId: user.id,
        loginResult: "FAILED",
        ipAddress,
        userAgent,
        mfaType: null,
      });
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_002,
        message: "아이디 또는 비밀번호가 올바르지 않습니다",
      });
    }

    // 로그인 성공 — 실패 횟수 초기화 + 만료된 잠금 상태 해제
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        failed_login_count: 0,
        last_login_at: new Date(),
        ...(user.status === "LOCKED"
          ? { status: "ACTIVE", locked_until: null }
          : {}),
      },
    });

    const primaryMfa = user.user_mfa[0];
    if (primaryMfa?.is_verified) {
      await this.safeRecordLoginHistory({
        userId: user.id,
        loginResult: "MFA_PENDING",
        ipAddress,
        userAgent,
        mfaType: primaryMfa.mfa_type,
      });
      // MFA 필요 — 임시 토큰 발급 (access/refresh와 완전 분리된 MFA 전용 시크릿)
      const mfaSecret = this.config.getOrThrow<string>("jwt.mfaSecret");
      const mfaToken = this.jwtService.sign(
        { sub: user.id, type: "mfa_pending" },
        { expiresIn: "10m", secret: mfaSecret },
      );
      return { requireMfa: true, mfaToken, mfaType: primaryMfa.mfa_type };
    }

    await this.safeRecordLoginHistory({
      userId: user.id,
      loginResult: "SUCCESS",
      ipAddress,
      userAgent,
      mfaType: null,
    });

    // PCI DSS 8.3.1 — 최초 로그인(password_changed_at 미설정) 시 비밀번호 변경 강제
    if (!user.password_changed_at) {
      const result = await this.issueTokens(
        user.id,
        user.login_id,
        user.user_type,
      );
      return { ...result, mustChangePassword: true };
    }

    return this.issueTokens(user.id, user.login_id, user.user_type);
  }

  /**
   * @description MFA 2차 인증. mfa_pending 토큰 검증 → TOTP 코드 검증 → access/refresh 토큰 발급.
   * @param {MfaVerifyDto} dto - MFA 임시 토큰 + TOTP 6자리 코드
   * @param {string} ipAddress - 요청 IP (감사 로그용)
   * @param {string|null} userAgent - 브라우저 정보 (감사 로그용)
   * @returns {Promise<LoginResult>} access/refresh 토큰
   * @security PCI DSS 8.4.2 - TOTP 기반 다중 인증
   */
  async verifyMfa(
    dto: MfaVerifyDto,
    ipAddress: string,
    userAgent: string | null,
  ): Promise<LoginResult> {
    let payload: { sub: string; type: string };
    try {
      const mfaSecret = this.config.getOrThrow<string>("jwt.mfaSecret");
      payload = this.jwtService.verify<{ sub: string; type: string }>(
        dto.mfaToken,
        { secret: mfaSecret },
      );
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_006,
        message: "토큰이 만료되었습니다",
      });
    }

    if (payload.type !== "mfa_pending") {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_005,
        message: "MFA 코드가 올바르지 않습니다",
      });
    }

    const mfa = await this.prisma.user_mfa.findUnique({
      where: { user_id_mfa_type: { user_id: payload.sub, mfa_type: "TOTP" } },
    });

    if (!mfa || !mfa.is_primary || !mfa.is_verified) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_004,
        message: "MFA 설정을 찾을 수 없습니다",
      });
    }

    let decryptedSecret: string;
    try {
      decryptedSecret = this.decryptMfaSecret(mfa.secret_key);
    } catch (error) {
      this.logger.error(
        `MFA secret decryption failed for user ${payload.sub}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "인증 처리 중 오류가 발생했습니다",
      });
    }

    let isValid: boolean;
    try {
      isValid = authenticator.verify({
        token: dto.code,
        secret: decryptedSecret,
      });
    } catch (error) {
      this.logger.error(
        `MFA verification error for user ${payload.sub}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "인증 처리 중 오류가 발생했습니다",
      });
    }

    if (!isValid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_005,
        message: "MFA 코드가 올바르지 않습니다",
      });
    }

    const user = await this.prisma.users
      .findUniqueOrThrow({ where: { id: payload.sub } })
      .catch(() => {
        this.logger.error(`User not found after MFA verify: ${payload.sub}`);
        throw new UnauthorizedException({
          code: ERROR_CODES.AUTH_002,
          message: "사용자를 찾을 수 없습니다",
        });
      });

    await this.safeRecordLoginHistory({
      userId: user.id,
      loginResult: "SUCCESS",
      ipAddress,
      userAgent,
      mfaType: mfa.mfa_type,
    });

    // PCI DSS 8.3.1 — 최초 로그인 비밀번호 변경 강제 (MFA 통과 후에도 적용)
    if (!user.password_changed_at) {
      const result = await this.issueTokens(
        user.id,
        user.login_id,
        user.user_type,
      );
      return { ...result, mustChangePassword: true };
    }

    return this.issueTokens(user.id, user.login_id, user.user_type);
  }

  /**
   * @description Refresh 토큰으로 Access 토큰 갱신. SHA-256 해시 비교 + 만료/폐기 여부 확인.
   * @param {string} refreshToken - 클라이언트가 보유한 refresh 토큰 원문
   * @returns {Promise<{accessToken: string, expiresIn: number}>} 새 access 토큰
   * @security 토큰 원문은 DB에 저장하지 않음 (해시만 저장)
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const stored = await this.prisma.refresh_tokens.findUnique({
      where: { token_hash: tokenHash },
      include: { users: true },
    });

    if (!stored || stored.revoked_at !== null || stored.expires_at <= new Date()) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_006,
        message: "토큰이 만료되었거나 유효하지 않습니다",
      });
    }

    if (!stored.users || stored.users.status !== "ACTIVE") {
      this.logger.warn(
        `Refresh token used for inactive/missing user: ${stored.user_id}`,
      );
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_006,
        message: "토큰이 만료되었거나 유효하지 않습니다",
      });
    }

    const { roles, permissions } = await this.loadUserPermissions(
      stored.users.id,
    );

    if (!isValidUserType(stored.users.user_type)) {
      this.logger.error(
        `Invalid user_type '${stored.users.user_type}' for user ${stored.users.id}`,
      );
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_001,
        message: "인증이 필요합니다",
      });
    }

    const payload: JwtPayload = {
      sub: stored.users.id,
      loginId: stored.users.login_id,
      userType: stored.users.user_type,
      roles,
      permissions,
      ...(stored.users.merchant_id
        ? { merchantId: stored.users.merchant_id }
        : {}),
      ...(stored.users.agent_id ? { agentId: stored.users.agent_id } : {}),
    };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, expiresIn: SECURITY.ACCESS_TOKEN_EXPIRES_SECONDS };
  }

  /**
   * @description 로그아웃 처리. 해당 사용자의 refresh 토큰을 폐기(revoke).
   * @param {string} userId - 사용자 ID
   * @param {string} refreshToken - 폐기할 refresh 토큰 원문
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      const result = await this.prisma.refresh_tokens.updateMany({
        where: { user_id: userId, token_hash: tokenHash },
        data: { revoked_at: new Date() },
      });

      if (result.count === 0) {
        this.logger.warn(
          `Logout: no matching refresh token found for user ${userId}`,
        );
      }
    } else {
      await this.prisma.refresh_tokens.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      this.logger.warn(
        `Logout: no refresh token provided, revoked all tokens for user ${userId}`,
      );
    }
  }

  /**
   * @description 비밀번호 변경. 현재 비밀번호 확인 → 정책 검증(12자+대소문자+숫자+특수문자) → 새 해시 저장.
   * @param {string} userId - 사용자 ID
   * @param {ChangePasswordDto} dto - 현재 비밀번호 + 새 비밀번호
   * @security PCI DSS 8.3.6 - 비밀번호 복잡도 정책 적용
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (!validatePasswordPolicy(dto.newPassword)) {
      throw new BadRequestException({
        code: ERROR_CODES.AUTH_007,
        message:
          "비밀번호는 12자 이상, 대/소문자, 숫자, 특수문자를 포함해야 합니다",
      });
    }

    const user = await this.prisma.users
      .findUniqueOrThrow({ where: { id: userId } })
      .catch(() => {
        throw new BadRequestException({
          code: ERROR_CODES.USER_001,
          message: "사용자를 찾을 수 없습니다",
        });
      });

    const isCurrent = await bcrypt.compare(
      dto.currentPassword,
      user.password_hash,
    );

    if (!isCurrent) {
      throw new BadRequestException({
        code: ERROR_CODES.AUTH_002,
        message: "현재 비밀번호가 올바르지 않습니다",
      });
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.users.update({
      where: { id: userId },
      data: { password_hash: newHash, password_changed_at: new Date() },
    });
  }

  /**
   * @description MFA 초기 설정. TOTP 시크릿 생성 → AES-256-GCM 암호화 저장 → QR코드 Data URL 반환.
   * 이미 인증된 MFA가 있으면 거부, 미인증 MFA는 덮어쓰기.
   * @param {string} userId - 사용자 ID
   * @returns {Promise<MfaSetupResult>} TOTP 시크릿(평문, 앱 등록용) + QR코드 Data URL
   * @security PCI DSS 8.4.2 - TOTP 기반 MFA 설정
   * @security PCI DSS 3.5.1 - 시크릿 AES-256-GCM 암호화 저장
   */
  async setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await this.prisma.users
      .findUniqueOrThrow({ where: { id: userId } })
      .catch(() => {
        throw new BadRequestException({
          code: ERROR_CODES.USER_001,
          message: "사용자를 찾을 수 없습니다",
        });
      });

    const existing = await this.prisma.user_mfa.findUnique({
      where: { user_id_mfa_type: { user_id: userId, mfa_type: "TOTP" } },
    });

    if (existing?.is_verified) {
      throw new BadRequestException({
        code: ERROR_CODES.AUTH_004,
        message: "이미 MFA가 활성화되어 있습니다",
      });
    }

    if (existing && !existing.is_verified) {
      this.logger.warn(
        `MFA setup overwrite: user ${userId} re-generating unverified MFA secret`,
      );
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.login_id, "PG-System", secret);
    const encryptedSecret = this.encryptMfaSecret(secret);

    await this.prisma.user_mfa.upsert({
      where: { user_id_mfa_type: { user_id: userId, mfa_type: "TOTP" } },
      update: { secret_key: encryptedSecret, is_verified: false },
      create: {
        user_id: userId,
        mfa_type: "TOTP",
        secret_key: encryptedSecret,
        is_verified: false,
        is_primary: true,
      },
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return { secret, qrCodeUrl };
  }

  /**
   * @description MFA 활성화 확정. 사용자가 입력한 TOTP 코드로 검증 성공 시 is_verified → true.
   * setupMfa() 이후 반드시 이 메서드를 호출해야 MFA가 실제 활성화됨.
   * @param {string} userId - 사용자 ID
   * @param {MfaEnableDto} dto - TOTP 6자리 확인 코드
   * @security PCI DSS 8.4.2 - TOTP 검증을 통한 MFA 활성화
   */
  async enableMfa(userId: string, dto: MfaEnableDto): Promise<void> {
    const mfa = await this.prisma.user_mfa.findUnique({
      where: { user_id_mfa_type: { user_id: userId, mfa_type: "TOTP" } },
    });

    if (!mfa) {
      throw new BadRequestException({
        code: ERROR_CODES.AUTH_004,
        message: "MFA 설정을 먼저 진행해주세요",
      });
    }

    if (mfa.is_verified) {
      throw new BadRequestException({
        code: ERROR_CODES.AUTH_004,
        message: "이미 MFA가 활성화되어 있습니다",
      });
    }

    let decryptedSecret: string;
    try {
      decryptedSecret = this.decryptMfaSecret(mfa.secret_key);
    } catch (error) {
      this.logger.error(
        `MFA secret decryption failed during enable for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "인증 처리 중 오류가 발생했습니다",
      });
    }

    let isValid: boolean;
    try {
      isValid = authenticator.verify({
        token: dto.code,
        secret: decryptedSecret,
      });
    } catch (error) {
      this.logger.error(
        `MFA verification error during enable for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "인증 처리 중 오류가 발생했습니다",
      });
    }

    if (!isValid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_005,
        message: "MFA 코드가 올바르지 않습니다",
      });
    }

    await this.prisma.user_mfa.update({
      where: { user_id_mfa_type: { user_id: userId, mfa_type: "TOTP" } },
      data: { is_verified: true, is_primary: true },
    });
  }

  /**
   * @description 로그인 이력 기록. 성공/실패/MFA 대기 등 모든 인증 시도를 DB에 저장.
   * @param {LoginHistoryInput} input - 사용자ID, 결과, IP, UserAgent, MFA유형
   * @audit PCI DSS 10.2.4 - 모든 인증 시도 기록
   */
  async recordLoginHistory(input: LoginHistoryInput): Promise<void> {
    await this.prisma.login_history.create({
      data: {
        user_id: input.userId,
        login_result: input.loginResult,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        mfa_type: input.mfaType,
      },
    });
  }

  /** 감사 로그 안전 래퍼 — 로그 기록 실패가 인증 플로우를 차단하지 않도록 에러 흡수. */
  private async safeRecordLoginHistory(
    input: LoginHistoryInput,
  ): Promise<void> {
    try {
      await this.recordLoginHistory(input);
    } catch (error) {
      this.logger.error(
        `Failed to record login history for user ${input.userId}: ${input.loginResult}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * 로그인 실패 처리 — 실패 횟수 원자적 증가 + 임계값 초과 시 계정 잠금.
   * Prisma increment로 race condition 방지.
   * @security PCI DSS 8.3.4 - MAX_LOGIN_ATTEMPTS 초과 시 LOCK_DURATION_MINUTES 동안 잠금
   */
  private async handleFailedLogin(userId: string): Promise<void> {
    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: { failed_login_count: { increment: 1 } },
      select: { failed_login_count: true },
    });

    if (updated.failed_login_count >= SECURITY.MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(
        lockedUntil.getMinutes() + SECURITY.LOCK_DURATION_MINUTES,
      );
      await this.prisma.users.update({
        where: { id: userId },
        data: { status: "LOCKED", locked_until: lockedUntil },
      });
      this.logger.warn(
        `Account locked: user ${userId} exceeded ${SECURITY.MAX_LOGIN_ATTEMPTS} failed attempts`,
      );
    }
  }

  /**
   * 사용자에게 할당된 역할·권한 코드를 로드. JWT 페이로드에 포함할 roles/permissions 배열 생성.
   * Cache-Aside: Redis/인메모리 캐시 우선 조회 → 미적중 시 DB 조회 후 캐시 저장.
   * TTL = Access Token 만료(15분)와 동일 — 토큰 갱신 시 최신 권한 반영.
   */
  private async loadUserPermissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const cacheKey = `user_permissions:${userId}`;
    const cached = await this.cache.get<{ roles: string[]; permissions: string[] }>(cacheKey);
    if (cached) return cached;

    const userRoles = await this.prisma.user_roles.findMany({
      where: { user_id: userId },
      include: {
        roles: {
          include: {
            role_permissions: {
              include: { permissions: true },
            },
          },
        },
      },
    });

    if (userRoles.length === 0) {
      this.logger.warn(`No roles assigned to user ${userId}`);
    }

    const roles = userRoles.map((ur) => ur.roles.name);
    const permissionSet = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.roles.role_permissions) {
        permissionSet.add(rp.permissions.code);
      }
    }
    const result = { roles, permissions: [...permissionSet] };
    await this.cache.set(cacheKey, result, CACHE_TTL.USER_PERMISSIONS);
    return result;
  }

  /**
   * Access/Refresh 토큰 발급. 기존 refresh 토큰 전체 폐기 후 새 토큰 생성 (세션 고정 방지).
   * 콜백 트랜잭션으로 ACID 원자성 보장.
   * @security PCI DSS 8.2.8 - 세션 고정 방지 (기존 토큰 삭제 후 신규 발급)
   */
  private async issueTokens(
    userId: string,
    loginId: string,
    userType: string,
  ): Promise<LoginResult> {
    if (!isValidUserType(userType)) {
      this.logger.error(`Invalid user_type '${userType}' for user ${userId}`);
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_001,
        message: "인증이 필요합니다",
      });
    }

    const { roles, permissions } = await this.loadUserPermissions(userId);

    // 가맹점/대리점 유저의 데이터 소유권 검증을 위해 merchant_id/agent_id 조회
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { merchant_id: true, agent_id: true },
    });

    const payload: JwtPayload = {
      sub: userId,
      loginId,
      userType,
      roles,
      permissions,
      ...(user?.merchant_id ? { merchantId: user.merchant_id } : {}),
      ...(user?.agent_id ? { agentId: user.agent_id } : {}),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshTokenRaw = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshTokenRaw)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + SECURITY.REFRESH_TOKEN_EXPIRES_DAYS * 86_400_000,
    );

    try {
      // 세션 고정 방지 (PCI DSS 8.2.8): 기존 리프레시 토큰 모두 폐기 후 새 토큰 발급.
      // 주의: 콜백(interactive) 패턴 사용 필수. 배열 패턴 $transaction([p1, p2])는
      // 각 Promise가 즉시 실행되어 deleteMany 성공 후 create 실패 시 롤백 불가.
      // 콜백 패턴은 단일 DB 트랜잭션 내에서 ACID 원자성을 보장함.
      await this.prisma.$transaction(async (tx) => {
        await tx.refresh_tokens.deleteMany({
          where: { user_id: userId },
        });
        await tx.refresh_tokens.create({
          data: {
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to create refresh token for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "인증 처리 중 오류가 발생했습니다",
      });
    }

    return {
      requireMfa: false,
      userType: payload.userType,
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: SECURITY.ACCESS_TOKEN_EXPIRES_SECONDS,
    };
  }
}
