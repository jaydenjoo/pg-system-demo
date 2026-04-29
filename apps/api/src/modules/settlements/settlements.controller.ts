import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SettlementsService } from "./settlements.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { OwnershipInterceptor } from "../../common/interceptors/ownership.interceptor";
import { SettlementListQueryDto } from "./dto/settlement-list-query.dto";
import { CalculateSettlementDto } from "./dto/calculate-settlement.dto";
import { AgentSettlementQueryDto } from "./dto/agent-settlement-query.dto";

@Controller("api/v1/settlements")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
@ApiTags("Settlements")
@ApiBearerAuth("JWT")
/**
 * @description 정산(Settlement) 관리 컨트롤러. 정산 조회·산출·확정·완료 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (SETTLEMENT_READ/CREATE/APPROVE).
 * 정산 상태 전이: CALCULATED → CONFIRMED → REMITTED → COMPLETED.
 * 대리점별 정산 내역 조회 및 상세 확인 기능 포함.
 * @security PCI DSS 6.5 - 정산 금액 무결성 보장 및 상태 전이 규칙 적용
 */
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  /** GET /settlements/queue-status — 정산 배치 큐 상태 조회 (관리자 모니터링) */
  @Get("queue-status")
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  @ApiOperation({ summary: "정산 배치 큐 상태 조회" })
  @ApiResponse({ status: 200, description: "큐 상태 (waiting/active/completed/failed)" })
  async getQueueStatus() {
    const status = await this.settlementsService.getQueueStatus();
    return { data: status };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  @ApiOperation({ summary: "정산 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "정산 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async findAll(@Query() query: SettlementListQueryDto) {
    return this.settlementsService.findAll(query);
  }

  @Get("agents")
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  @ApiOperation({ summary: "대리점 정산 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "대리점 정산 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async getAgentSettlements(@Query() query: AgentSettlementQueryDto) {
    return this.settlementsService.getAgentSettlements(query);
  }

  @Get("agents/:id")
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  @ApiOperation({ summary: "대리점 정산 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "대리점 정산 상세 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "정산 정보 없음",
  })
  async getAgentSettlementDetail(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.settlementsService.getAgentSettlementDetail(id) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  @ApiOperation({ summary: "정산 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "정산 상세 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "정산 정보 없음",
  })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.settlementsService.findOne(id) };
  }

  @Post("calculate")
  @RequirePermissions(PERMISSIONS.SETTLEMENT_CONFIRM)
  @ApiOperation({ summary: "정산액 계산" })
  @ApiResponse({
    status: 201,
    description: "정산액 계산 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async calculate(
    @Body() dto: CalculateSettlementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.settlementsService.calculate(dto, user.sub) };
  }

  @Post(":id/confirm")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SETTLEMENT_CONFIRM)
  @ApiOperation({ summary: "정산 승인" })
  @ApiResponse({
    status: 200,
    description: "정산 승인 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "정산 정보 없음",
  })
  async confirm(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.settlementsService.confirm(id, user.sub) };
  }

  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SETTLEMENT_CONFIRM)
  @ApiOperation({ summary: "정산 완료" })
  @ApiResponse({
    status: 200,
    description: "정산 완료 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "정산 정보 없음",
  })
  async complete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.settlementsService.complete(id, user.sub) };
  }
}
