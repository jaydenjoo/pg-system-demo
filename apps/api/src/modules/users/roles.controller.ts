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
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { RolesService } from "./roles.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { AssignPermissionsDto } from "./dto/assign-permissions.dto";

/**
 * @description 역할(Role) 관리 컨트롤러. RBAC 기반 역할 CRUD 및 권한 할당 엔드포인트 제공.
 * 조회는 USER_READ 권한, 생성·수정·삭제·권한할당은 SYSTEM_MANAGE 권한 필요.
 * @security PCI DSS 7.1 - 업무 역할별 접근 권한 정의 및 관리
 */
@ApiTags("Roles")
@ApiBearerAuth("JWT")
@Controller("api/v1/roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiOperation({ summary: "모든 역할 조회" })
  @ApiResponse({ status: 200, description: "역할 목록 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  async findAll() {
    return this.rolesService.findAllRoles();
  }

  @ApiOperation({ summary: "새 역할 생성" })
  @ApiResponse({ status: 201, description: "역할 생성 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력 데이터" })
  @ApiResponse({ status: 403, description: "권한 부족 (SYSTEM_MANAGE 필요)" })
  @Post()
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtPayload) {
    return { data: await this.rolesService.createRole(dto, user.sub) };
  }

  @ApiOperation({ summary: "특정 역할 조회" })
  @ApiResponse({ status: 200, description: "역할 정보 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @ApiResponse({ status: 404, description: "역할을 찾을 수 없음" })
  @Get(":id")
  @RequirePermissions(PERMISSIONS.USER_READ)
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.rolesService.findRoleById(id) };
  }

  @ApiOperation({ summary: "역할 정보 업데이트" })
  @ApiResponse({ status: 200, description: "역할 업데이트 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력 데이터" })
  @ApiResponse({ status: 403, description: "권한 부족 (SYSTEM_MANAGE 필요)" })
  @ApiResponse({ status: 404, description: "역할을 찾을 수 없음" })
  @Put(":id")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.rolesService.updateRole(id, dto, user.sub) };
  }

  @ApiOperation({ summary: "역할 삭제" })
  @ApiResponse({ status: 204, description: "역할 삭제 완료" })
  @ApiResponse({ status: 403, description: "권한 부족 (SYSTEM_MANAGE 필요)" })
  @ApiResponse({ status: 404, description: "역할을 찾을 수 없음" })
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.rolesService.deleteRole(id, user.sub);
  }

  @ApiOperation({ summary: "역할에 권한 할당" })
  @ApiResponse({ status: 200, description: "권한 할당 완료" })
  @ApiResponse({ status: 400, description: "유효하지 않은 권한 ID" })
  @ApiResponse({ status: 403, description: "권한 부족 (SYSTEM_MANAGE 필요)" })
  @Put(":id/permissions")
  @RequirePermissions(PERMISSIONS.SYSTEM_MANAGE)
  async assignPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.rolesService.assignPermissions(
        id,
        dto.permissionIds,
        user.sub,
      ),
    };
  }
}

/**
 * @description 권한(Permission) 조회 컨트롤러. 시스템에 등록된 전체 권한 목록 조회 엔드포인트.
 * 역할에 권한을 할당할 때 선택 가능한 권한 목록을 제공하는 용도.
 */
@ApiTags("Permissions")
@ApiBearerAuth("JWT")
@Controller("api/v1/permissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiOperation({ summary: "모든 권한 조회" })
  @ApiResponse({ status: 200, description: "권한 목록 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  async findAll() {
    return this.rolesService.getAllPermissions();
  }
}
