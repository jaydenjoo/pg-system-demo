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
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { AgentsService } from "./agents.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@pg-system/shared";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { UpdateAgentDto } from "./dto/update-agent.dto";
import { AgentListQueryDto } from "./dto/agent-list-query.dto";
import { ChangeAgentStatusDto } from "./dto/change-agent-status.dto";

/**
 * @description 대리점(Agent) 관리 컨트롤러. 대리점 CRUD·상태변경·하위대리점 조회 엔드포인트 제공.
 * JWT 인증 + 권한 가드 적용 (AGENT_READ/CREATE/UPDATE/DELETE).
 * 다단계 대리점 구조(parent_agent_id)를 지원하며, 계좌번호 마스킹 처리 적용.
 * @security PCI DSS 7.1 - 대리점 계층별 접근 권한 분리
 */
@Controller("api/v1/agents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags("Agents")
@ApiBearerAuth("JWT")
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AGENT_READ)
  @ApiOperation({ summary: "대리점 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "대리점 목록 조회 성공",
  })
  @ApiResponse({
    status: 401,
    description: "인증 실패",
  })
  @ApiResponse({
    status: 403,
    description: "권한 부족",
  })
  async findAll(@Query() query: AgentListQueryDto) {
    return this.agentsService.findAll(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AGENT_CREATE)
  @ApiOperation({ summary: "새 대리점 생성" })
  @ApiResponse({
    status: 201,
    description: "대리점 생성 성공",
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
  async create(@Body() dto: CreateAgentDto, @CurrentUser() user: JwtPayload) {
    return { data: await this.agentsService.create(dto, user.sub) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.AGENT_READ)
  @ApiOperation({ summary: "대리점 상세 조회" })
  @ApiResponse({
    status: 200,
    description: "대리점 조회 성공",
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
    description: "대리점을 찾을 수 없음",
  })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.agentsService.findOne(id) };
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.AGENT_UPDATE)
  @ApiOperation({ summary: "대리점 정보 수정" })
  @ApiResponse({
    status: 200,
    description: "대리점 수정 성공",
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
    description: "대리점을 찾을 수 없음",
  })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { data: await this.agentsService.update(id, dto, user.sub) };
  }

  @Get(":id/sub-agents")
  @RequirePermissions(PERMISSIONS.AGENT_READ)
  @ApiOperation({ summary: "하위 대리점 목록 조회" })
  @ApiResponse({
    status: 200,
    description: "하위 대리점 조회 성공",
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
    description: "대리점을 찾을 수 없음",
  })
  async getSubAgents(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.agentsService.getSubAgents(id) };
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.AGENT_UPDATE)
  @ApiOperation({ summary: "대리점 상태 변경" })
  @ApiResponse({
    status: 200,
    description: "대리점 상태 변경 성공",
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
    description: "대리점을 찾을 수 없음",
  })
  async changeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeAgentStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      data: await this.agentsService.changeStatus(id, dto.status, user.sub),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.AGENT_DELETE)
  @ApiOperation({ summary: "대리점 삭제" })
  @ApiResponse({
    status: 204,
    description: "대리점 삭제 성공",
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
    description: "대리점을 찾을 수 없음",
  })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.agentsService.remove(id, user.sub);
  }
}
