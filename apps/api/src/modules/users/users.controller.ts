import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import type { JwtPayload } from "../../common/decorators/current-user.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserListQueryDto } from "./dto/user-list-query.dto";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { AssignRolesDto } from "./dto/assign-roles.dto";

/**
 * @description 사용자(User) 관리 컨트롤러. CRUD·역할 할당·본인 프로필 관리 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (USER_READ/CREATE/UPDATE/DELETE).
 * 본인 정보 조회(GET /me)와 프로필 수정(PUT /me)은 별도 권한 불요.
 * @security PCI DSS 8.2.1 - 고유 사용자 ID 기반 접근 통제
 */
@ApiTags("Users")
@ApiBearerAuth("JWT")
@Controller("api/v1/users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: "현재 로그인 사용자 정보 조회" })
  @ApiResponse({ status: 200, description: "사용자 정보 및 권한 반환" })
  @ApiResponse({ status: 401, description: "토큰 없음 또는 만료됨" })
  @Get("me")
  async getMe(@CurrentUser() user: JwtPayload) {
    const userData = await this.usersService.findById(user.sub);
    return { data: { ...userData, permissions: user.permissions } };
  }

  @ApiOperation({ summary: "현재 사용자 프로필 업데이트" })
  @ApiResponse({ status: 200, description: "프로필 업데이트 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력 데이터" })
  @Put("me")
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return { data: await this.usersService.updateProfile(user.sub, dto) };
  }

  @ApiOperation({ summary: "모든 사용자 조회 (페이징)" })
  @ApiResponse({ status: 200, description: "사용자 목록 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  async findAll(@Query() query: UserListQueryDto) {
    return this.usersService.findAll(query);
  }

  @ApiOperation({ summary: "새 사용자 생성" })
  @ApiResponse({ status: 201, description: "사용자 생성 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력 데이터" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_CREATE 필요)" })
  @Post()
  @RequirePermissions(PERMISSIONS.USER_CREATE)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return { data: await this.usersService.create(dto, user.sub) };
  }

  @ApiOperation({ summary: "특정 사용자 조회" })
  @ApiResponse({ status: 200, description: "사용자 정보 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Get(":id")
  @RequirePermissions(PERMISSIONS.USER_READ)
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.usersService.findById(id) };
  }

  @ApiOperation({ summary: "사용자 정보 업데이트" })
  @ApiResponse({ status: 200, description: "사용자 업데이트 성공" })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력 데이터" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_UPDATE 필요)" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Put(":id")
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  async update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return { data: await this.usersService.update(id, dto, user.sub) };
  }

  @ApiOperation({ summary: "사용자 비활성화 (삭제)" })
  @ApiResponse({ status: 200, description: "사용자 비활성화 완료" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_DELETE 필요)" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Delete(":id")
  @RequirePermissions(PERMISSIONS.USER_DELETE)
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.usersService.remove(id, user.sub);
    return { data: { message: "사용자가 비활성화되었습니다" } };
  }

  @ApiOperation({ summary: "사용자에게 역할 할당" })
  @ApiResponse({ status: 200, description: "역할 할당 완료" })
  @ApiResponse({ status: 400, description: "유효하지 않은 역할 ID" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_UPDATE 필요)" })
  @Put(":id/roles")
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  async assignRoles(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.usersService.assignRoles(id, dto.roleIds, user.sub);
  }

  @ApiOperation({ summary: "사용자의 역할 조회" })
  @ApiResponse({ status: 200, description: "사용자 역할 목록 반환" })
  @ApiResponse({ status: 403, description: "권한 부족 (USER_READ 필요)" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없음" })
  @Get(":id/roles")
  @RequirePermissions(PERMISSIONS.USER_READ)
  async getUserRoles(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.getUserRoles(id);
  }
}
