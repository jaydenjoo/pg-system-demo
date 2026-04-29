import {
  Body,
  Controller,
  Get,
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
import { CommissionsService } from "./commissions.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { SetAgentCommissionDto } from "./dto/set-agent-commission.dto";
import { SetMerchantCommissionDto } from "./dto/set-merchant-commission.dto";
import { SetPgMarginDto } from "./dto/set-pg-margin.dto";
import { CommissionQueryDto } from "./dto/commission-query.dto";
import { OwnershipInterceptor } from "../../common/interceptors/ownership.interceptor";

@Controller("api/v1/commissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
@ApiTags("Commissions")
@ApiBearerAuth("JWT")
/**
 * @description 수수료(Commission) 관리 컨트롤러. PG마진·대리점·가맹점 수수료 설정 및 조회 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (COMMISSION_READ/MANAGE).
 * 3단계 수수료 구조: PG 마진 → 대리점 수수료 → 가맹점 수수료.
 * 수수료 변경 이력 추적 기능 포함.
 * @security PCI DSS 6.5 - 수수료 금액 변조 방지 및 변경 이력 보존
 */
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get("pg-margins")
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  @ApiOperation({ summary: "PG 마진율 조회" })
  @ApiResponse({
    status: 200,
    description: "PG 마진율 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async getPgMargins(@Query() query: CommissionQueryDto) {
    return { data: await this.commissionsService.getPgMargins(query) };
  }

  @Post("pg-margins")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  @ApiOperation({ summary: "PG 마진율 설정" })
  @ApiResponse({
    status: 201,
    description: "PG 마진율 설정 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async setPgMargin(
    @Body() dto: SetPgMarginDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.commissionsService.setPgMargin(dto, user.sub),
    };
  }

  @Get("agents/:agentId")
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  @ApiOperation({ summary: "대리점 수수료 조회" })
  @ApiResponse({
    status: 200,
    description: "대리점 수수료 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async getAgentCommissions(
    @Param("agentId", ParseUUIDPipe) agentId: string,
    @Query() query: CommissionQueryDto,
  ) {
    return {
      data: await this.commissionsService.getAgentCommissions(agentId, query),
    };
  }

  @Post("agents/:agentId")
  @RequirePermissions(PERMISSIONS.COMMISSION_UPDATE)
  @ApiOperation({ summary: "대리점 수수료 설정" })
  @ApiResponse({
    status: 201,
    description: "대리점 수수료 설정 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async setAgentCommission(
    @Param("agentId", ParseUUIDPipe) agentId: string,
    @Body() dto: SetAgentCommissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.commissionsService.setAgentCommission(
        agentId,
        dto,
        user.sub,
      ),
    };
  }

  @Get("merchants/:merchantId")
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  @ApiOperation({ summary: "가맹점 수수료 조회" })
  @ApiResponse({
    status: 200,
    description: "가맹점 수수료 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async getMerchantCommissions(
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
    @Query() query: CommissionQueryDto,
  ) {
    return {
      data: await this.commissionsService.getMerchantCommissions(
        merchantId,
        query,
      ),
    };
  }

  @Post("merchants/:merchantId")
  @RequirePermissions(PERMISSIONS.COMMISSION_UPDATE)
  @ApiOperation({ summary: "가맹점 수수료 설정" })
  @ApiResponse({
    status: 201,
    description: "가맹점 수수료 설정 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async setMerchantCommission(
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
    @Body() dto: SetMerchantCommissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.commissionsService.setMerchantCommission(
        merchantId,
        dto,
        user.sub,
      ),
    };
  }

  @Get("history/:entityType/:entityId")
  @RequirePermissions(PERMISSIONS.COMMISSION_READ)
  @ApiOperation({ summary: "수수료 변경 이력 조회" })
  @ApiResponse({
    status: 200,
    description: "수수료 변경 이력 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async getCommissionHistory(
    @Param("entityType") entityType: "agent" | "merchant",
    @Param("entityId", ParseUUIDPipe) entityId: string,
    @Query("paymentMethod") paymentMethod?: string,
  ) {
    return {
      data: await this.commissionsService.getCommissionHistory(
        entityType,
        entityId,
        paymentMethod,
      ),
    };
  }
}
