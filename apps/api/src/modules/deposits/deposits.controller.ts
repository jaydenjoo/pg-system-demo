import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { DepositsService } from "./deposits.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { DepositListQueryDto } from "./dto/deposit-list-query.dto";
import { CreateDepositDto } from "./dto/create-deposit.dto";
import { ManualMatchDto } from "./dto/manual-match.dto";

@Controller("api/v1/deposits")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags("Deposits")
@ApiBearerAuth("JWT")
/**
 * @description 입금(Deposit) 관리 컨트롤러. 입금 내역 조회·등록·대사·수동매칭·매칭해제 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (DEPOSIT_READ/CREATE/RECONCILE).
 * 입금 대사(Reconciliation) 플로우: 입금 등록 → 자동/수동 거래 매칭 → 대사 완료.
 * @security PCI DSS 6.5 - 입금·거래 매칭 무결성 보장
 */
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEPOSIT_READ)
  @ApiOperation({ summary: "입금 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "입금 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async findAll(@Query() query: DepositListQueryDto) {
    return this.depositsService.findAll(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEPOSIT_CREATE)
  @ApiOperation({ summary: "입금 기록 생성" })
  @ApiResponse({
    status: 201,
    description: "입금 기록 생성 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async create(@Body() dto: CreateDepositDto, @CurrentUser() user: JwtPayload) {
    return { data: await this.depositsService.create(dto, user.sub) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.DEPOSIT_READ)
  @ApiOperation({ summary: "입금 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "입금 상세 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "입금 정보 없음",
  })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.depositsService.findOne(id) };
  }

  @Post(":id/reconcile")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.DEPOSIT_RECONCILE)
  @ApiOperation({ summary: "입금 대사" })
  @ApiResponse({
    status: 200,
    description: "입금 대사 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "입금 정보 없음",
  })
  async reconcile(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.depositsService.reconcile(id, user.sub) };
  }

  @Post(":id/match")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.DEPOSIT_RECONCILE)
  @ApiOperation({ summary: "입금 수동 매칭" })
  @ApiResponse({
    status: 200,
    description: "입금 수동 매칭 성공",
  })
  @ApiResponse({
    status: 400,
    description: "입력값 검증 실패",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  async manualMatch(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ManualMatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.depositsService.manualMatch(id, dto, user.sub) };
  }

  @Delete(":id/matches/:matchId")
  @RequirePermissions(PERMISSIONS.DEPOSIT_RECONCILE)
  @ApiOperation({ summary: "입금 매칭 해제" })
  @ApiResponse({
    status: 200,
    description: "입금 매칭 해제 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 404,
    description: "입금 또는 매칭 정보 없음",
  })
  async unmatch(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("matchId", ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.depositsService.unmatch(id, matchId, user.sub);
    return { data: null };
  }
}
