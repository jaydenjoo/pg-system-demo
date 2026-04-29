import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { MerchantsService } from "./merchants.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { MerchantListQueryDto } from "./dto/merchant-list-query.dto";
import { ChangeMerchantStatusDto } from "./dto/change-merchant-status.dto";
import { PERMISSIONS } from "@pg-system/shared";
import { OwnershipInterceptor } from "../../common/interceptors/ownership.interceptor";

/**
 * @description 가맹점(Merchant) 관리 컨트롤러. 가맹점 CRUD·상태변경 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (MERCHANT_READ/CREATE/UPDATE/DELETE).
 * 가맹점 코드 자동 생성, 계좌번호 마스킹 처리, 소프트 삭제 방식 적용.
 * @security PCI DSS 7.1 - 가맹점별 접근 권한 분리
 */
@Controller("api/v1/merchants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(OwnershipInterceptor)
@ApiTags("Merchants")
@ApiBearerAuth("JWT")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MERCHANT_READ)
  @ApiOperation({ summary: "가맹점 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "가맹점 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  async findAll(@Query() query: MerchantListQueryDto) {
    return this.merchantsService.findAll(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MERCHANT_CREATE)
  @ApiOperation({ summary: "새 가맹점 생성" })
  @ApiResponse({
    status: 201,
    description: "가맹점 생성 성공",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 요청",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  async create(
    @Body() dto: CreateMerchantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.merchantsService.create(dto, user.sub) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.MERCHANT_READ)
  @ApiOperation({ summary: "가맹점 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "가맹점 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "가맹점을 찾을 수 없음",
  })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.merchantsService.findOne(id) };
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.MERCHANT_UPDATE)
  @ApiOperation({ summary: "가맹점 정보 수정" })
  @ApiResponse({
    status: 200,
    description: "가맹점 수정 성공",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 요청",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "가맹점을 찾을 수 없음",
  })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.merchantsService.update(id, dto, user.sub) };
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.MERCHANT_UPDATE)
  @ApiOperation({ summary: "가맹점 상태 변경" })
  @ApiResponse({
    status: 200,
    description: "가맹점 상태 변경 성공",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 요청",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "가맹점을 찾을 수 없음",
  })
  async changeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeMerchantStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.merchantsService.changeStatus(id, dto.status, user.sub),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.MERCHANT_DELETE)
  @ApiOperation({ summary: "가맹점 삭제" })
  @ApiResponse({
    status: 204,
    description: "가맹점 삭제 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  @ApiResponse({
    status: 404,
    description: "가맹점을 찾을 수 없음",
  })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.merchantsService.remove(id, user.sub);
  }
}
