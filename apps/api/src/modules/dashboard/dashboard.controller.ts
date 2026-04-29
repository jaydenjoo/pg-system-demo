import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { OwnershipInterceptor } from "../../common/interceptors/ownership.interceptor";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@ApiTags("Dashboard")
@ApiBearerAuth("JWT")
@Controller("api/v1/dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
/**
 * @description 대시보드(Dashboard) 컨트롤러. 거래·정산 통계, 일일 추이, 상위 가맹점/대리점 조회 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (DASHBOARD_READ).
 * 날짜 범위 기반 필터링으로 요약·통계·추이 데이터를 제공하는 읽기 전용 API.
 * @security PCI DSS 7.1 - 대시보드 데이터 접근 권한 분리
 */
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: "대시보드 요약 정보 조회" })
  @ApiResponse({ status: 200, description: "대시보드 요약 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("summary")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getSummary(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getSummary(query) };
  }

  @ApiOperation({ summary: "거래 통계 조회" })
  @ApiResponse({ status: 200, description: "거래 통계 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("transaction-stats")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getTransactionStats(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getTransactionStats(query) };
  }

  @ApiOperation({ summary: "정산 통계 조회" })
  @ApiResponse({ status: 200, description: "정산 통계 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("settlement-stats")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getSettlementStats(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getSettlementStats(query) };
  }

  @ApiOperation({ summary: "일일 추이 조회" })
  @ApiResponse({ status: 200, description: "일일 추이 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("daily-trend")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getDailyTrend(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getDailyTrend(query) };
  }

  @ApiOperation({ summary: "상위 가맹점 조회" })
  @ApiResponse({ status: 200, description: "상위 가맹점 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("top-merchants")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getTopMerchants(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getTopMerchants(query) };
  }

  @ApiOperation({ summary: "상위 대리점 조회" })
  @ApiResponse({ status: 200, description: "상위 대리점 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("top-agents")
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  async getTopAgents(@Query() query: DashboardQueryDto) {
    return { data: await this.dashboardService.getTopAgents(query) };
  }
}
