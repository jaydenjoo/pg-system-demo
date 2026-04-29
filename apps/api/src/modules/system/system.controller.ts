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
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { SystemService } from "./system.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { CreateSystemCodeDto } from "./dto/create-system-code.dto";
import { UpdateSystemCodeDto } from "./dto/update-system-code.dto";

@ApiTags("System")
@ApiBearerAuth("JWT")
@Controller("api/v1/system")
@UseGuards(JwtAuthGuard, PermissionsGuard)
/**
 * @description 시스템(System) 관리 컨트롤러. 시스템 코드 CRUD·공휴일·메뉴 트리·알림 관리 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (SYSTEM_MANAGE).
 * 시스템 공통 코드(결제수단, 은행코드 등) 관리 및 메뉴 구조 제어 기능 제공.
 * @security PCI DSS 7.1 - 시스템 설정 변경 권한 최소화 (SUPER_ADMIN 전용)
 */
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @ApiOperation({ summary: "모든 시스템 코드 조회" })
  @ApiResponse({ status: 200, description: "시스템 코드 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("codes")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getSystemCodes() {
    return { data: await this.systemService.getSystemCodes() };
  }

  @ApiOperation({ summary: "그룹별 시스템 코드 조회" })
  @ApiResponse({ status: 200, description: "그룹 코드 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("codes/:groupCode")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getCodesByGroup(@Param("groupCode") groupCode: string) {
    return { data: await this.systemService.getCodesByGroup(groupCode) };
  }

  @ApiOperation({ summary: "새 시스템 코드 생성" })
  @ApiResponse({ status: 201, description: "시스템 코드 생성됨" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Post("codes")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async createCode(
    @Body() dto: CreateSystemCodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.systemService.createCode(dto, user.sub) };
  }

  @ApiOperation({ summary: "시스템 코드 수정" })
  @ApiResponse({ status: 200, description: "시스템 코드 수정됨" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "코드를 찾을 수 없음" })
  @Put("codes/:id")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async updateCode(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSystemCodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.systemService.updateCode(id, dto, user.sub) };
  }

  @ApiOperation({ summary: "시스템 코드 삭제" })
  @ApiResponse({ status: 204, description: "시스템 코드 삭제됨" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "코드를 찾을 수 없음" })
  @Delete("codes/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async deleteCode(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.systemService.deleteCode(id, user.sub);
  }

  @ApiOperation({ summary: "공휴일 목록 조회" })
  @ApiResponse({ status: 200, description: "공휴일 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("holidays")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getHolidays() {
    return { data: await this.systemService.getHolidays() };
  }

  @ApiOperation({ summary: "메뉴 트리 조회" })
  @ApiResponse({ status: 200, description: "메뉴 트리 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("menus")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getMenus() {
    return { data: await this.systemService.getMenuTree() };
  }

  @ApiOperation({ summary: "활성 알림 조회" })
  @ApiResponse({ status: 200, description: "활성 알림 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 실패" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @Get("notifications")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async getNotifications() {
    return { data: await this.systemService.getActiveNotifications() };
  }
}
