import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { SecurityService } from "./security.service";
import { IntegrityMonitorService } from "./integrity-monitor.service";
import { AuditHashChainService } from "./audit-hash-chain.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import { RiskAlertQueryDto } from "./dto/risk-alert-query.dto";

@ApiTags("Security")
@ApiBearerAuth("JWT")
@Controller("api/v1/security")
@UseGuards(JwtAuthGuard, PermissionsGuard)
/**
 * @description 보안(Security) 관리 컨트롤러. 감사 로그·리스크 알림·로그인 이력·해시 체인 검증·파일 무결성 모니터링 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (AUDIT_READ/RISK_READ/RISK_MANAGE/SYSTEM_MANAGE).
 * 감사 로그 해시 체인(SHA-256)으로 로그 위변조 탐지, FIM(File Integrity Monitoring)으로 파일 변조 탐지.
 * @security PCI DSS 10.x - 감사 추적 및 모니터링, 11.5 - 파일 무결성 모니터링
 */
export class SecurityController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly integrityMonitor: IntegrityMonitorService,
    private readonly auditHashChain: AuditHashChainService,
  ) {}

  @ApiOperation({ summary: "감사 로그 조회" })
  @ApiResponse({ status: 200, description: "감사 로그 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("audit-logs")
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.securityService.getAuditLogs(query);
  }

  @ApiOperation({ summary: "리스크 알림 조회" })
  @ApiResponse({ status: 200, description: "리스크 알림 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("risk-alerts")
  @RequirePermissions(PERMISSIONS.RISK_READ)
  async getRiskAlerts(@Query() query: RiskAlertQueryDto) {
    return this.securityService.getRiskAlerts(query);
  }

  @ApiOperation({ summary: "리스크 알림 해결 표시" })
  @ApiResponse({ status: 200, description: "알림이 해결 표시되었음" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "알림을 찾을 수 없음" })
  @Post("risk-alerts/:id/resolve")
  @RequirePermissions(PERMISSIONS.RISK_MANAGE)
  async resolveRiskAlert(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.securityService.resolveRiskAlert(id, user.sub) };
  }

  @ApiOperation({ summary: "로그인 이력 조회" })
  @ApiResponse({ status: 200, description: "로그인 이력 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("login-history")
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async getLoginHistory(@Query() query: AuditLogQueryDto) {
    return this.securityService.getLoginHistory(query);
  }

  // ---- 감사 로그 해시 체인 검증 — SUPER_ADMIN 전용 ----

  @ApiOperation({ summary: "감사 로그 해시 체인 검증" })
  @ApiResponse({ status: 200, description: "해시 체인 검증 결과 반환" })
  @ApiResponse({ status: 400, description: "날짜 파라미터 오류 또는 범위 초과" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("audit-chain/verify")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async verifyAuditChain(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        "startDate와 endDate 쿼리 파라미터가 필요합니다",
      );
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException("유효하지 않은 날짜 형식입니다");
    }
    const MAX_RANGE_DAYS = 90;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      throw new BadRequestException("endDate는 startDate 이후여야 합니다");
    }
    if (diffMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        `검증 기간은 최대 ${MAX_RANGE_DAYS}일까지 가능합니다`,
      );
    }
    return { data: await this.auditHashChain.verifyChain(start, end) };
  }

  @ApiOperation({ summary: "최신 감사 로그 해시 조회" })
  @ApiResponse({ status: 200, description: "최신 해시 값 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("audit-chain/latest-hash")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getLatestAuditHash() {
    const hash = await this.auditHashChain.getLatestHash();
    return { data: { latestHash: hash } };
  }

  // ---- FIM (파일 무결성 모니터링) — SUPER_ADMIN 전용 ----

  @ApiOperation({ summary: "파일 무결성 모니터링 상태 조회" })
  @ApiResponse({ status: 200, description: "파일 무결성 검사 결과 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("integrity/status")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getIntegrityStatus() {
    const cached = await this.integrityMonitor.getLastCheckResult();
    return { data: cached ?? (await this.integrityMonitor.checkIntegrity()) };
  }

  @ApiOperation({ summary: "파일 무결성 검사 수동 실행" })
  @ApiResponse({ status: 200, description: "파일 무결성 검사 결과 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Post("integrity/scan")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async triggerIntegrityScan() {
    return { data: await this.integrityMonitor.checkIntegrity() };
  }

  @ApiOperation({ summary: "파일 무결성 베이스라인 업데이트" })
  @ApiResponse({ status: 200, description: "베이스라인 업데이트 완료" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Post("integrity/baseline")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async updateBaseline(@CurrentUser() user: JwtPayload) {
    await this.integrityMonitor.updateBaseline(user.sub);
    return { data: { message: "베이스라인이 업데이트되었습니다" } };
  }
}
