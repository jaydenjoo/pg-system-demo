import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { MfaEnableDto } from "./dto/mfa-setup.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

const IP_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const candidate = forwarded.split(",")[0].trim();
    if (IP_PATTERN.test(candidate) && candidate.length <= 45) {
      return candidate;
    }
  }
  return req.ip ?? "0.0.0.0";
}

function extractUserAgent(req: Request): string | null {
  return (req.headers["user-agent"] as string) ?? null;
}

/**
 * @description 인증(Auth) 컨트롤러. 로그인·MFA·토큰갱신·로그아웃·비밀번호변경 엔드포인트 제공.
 * 모든 인증 엔드포인트에 Rate Limiting 적용 (PCI DSS 8.3.4 — 무차별 대입 방지).
 * 로그인 성공 시 HttpOnly 쿠키로 토큰 발급 (PCI DSS 8.2.2 — 안전한 세션 관리).
 * @security PCI DSS 8.x - 사용자 식별 및 인증 관리
 */
@ApiTags("Auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: "사용자 로그인" })
  @ApiResponse({
    status: 200,
    description: "로그인 성공 또는 MFA 인증 필요",
  })
  @ApiResponse({ status: 401, description: "잘못된 자격증명" })
  @ApiResponse({ status: 429, description: "요청 제한 초과" })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = extractIp(req);
    const ua = extractUserAgent(req);
    const result = await this.authService.login(dto, ip, ua);

    if (!result.requireMfa && result.accessToken) {
      res.cookie("accessToken", result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: (result.expiresIn ?? 900) * 1000,
      });
      res.cookie("refreshToken", result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return { data: result };
  }

  @ApiOperation({ summary: "MFA 인증 검증" })
  @ApiResponse({
    status: 200,
    description: "MFA 인증 완료, 토큰 발급",
  })
  @ApiResponse({ status: 401, description: "잘못된 MFA 코드" })
  @Post("login/mfa")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = extractIp(req);
    const ua = extractUserAgent(req);
    const result = await this.authService.verifyMfa(dto, ip, ua);

    if (result.accessToken) {
      res.cookie("accessToken", result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: (result.expiresIn ?? 900) * 1000,
      });
      res.cookie("refreshToken", result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return { data: result };
  }

  @ApiOperation({ summary: "액세스 토큰 갱신" })
  @ApiResponse({ status: 200, description: "새 토큰 발급" })
  @ApiResponse({ status: 401, description: "유효하지 않은 리프레시 토큰" })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async refresh(@Body() dto: RefreshTokenDto) {
    return { data: await this.authService.refreshToken(dto.refreshToken) };
  }

  @ApiOperation({ summary: "로그아웃" })
  @ApiBearerAuth("JWT")
  @ApiResponse({ status: 200, description: "로그아웃 성공" })
  @ApiResponse({ status: 401, description: "토큰 없음 또는 만료됨" })
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      (req.cookies as Record<string, string | undefined>)?.refreshToken ?? "";
    await this.authService.logout(user.sub, refreshToken);
    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.clearCookie("refreshToken", COOKIE_OPTIONS);
    return { data: { message: "로그아웃되었습니다" } };
  }

  @ApiOperation({ summary: "비밀번호 변경" })
  @ApiBearerAuth("JWT")
  @ApiResponse({ status: 200, description: "비밀번호 변경 성공" })
  @ApiResponse({ status: 401, description: "현재 비밀번호 불일치" })
  @Post("password/change")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.sub, dto);
    return { data: { message: "비밀번호가 변경되었습니다" } };
  }

  @ApiOperation({ summary: "MFA 설정 초기화 (QR 코드 생성)" })
  @ApiBearerAuth("JWT")
  @ApiResponse({ status: 200, description: "QR 코드 및 백업 코드 반환" })
  @Post("mfa/setup")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return { data: await this.authService.setupMfa(user.sub) };
  }

  @ApiOperation({ summary: "MFA 활성화 (QR 코드 확인 후)" })
  @ApiBearerAuth("JWT")
  @ApiResponse({ status: 200, description: "MFA 활성화 완료" })
  @ApiResponse({ status: 400, description: "잘못된 인증 코드" })
  @Post("mfa/enable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async enableMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaEnableDto) {
    await this.authService.enableMfa(user.sub, dto);
    return { data: { message: "MFA가 활성화되었습니다" } };
  }
}
