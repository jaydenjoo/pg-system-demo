import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { HealthService } from "./health.service";
import { HealthResponse } from "./dto/health-response.dto";

/**
 * @description 헬스 체크(Health) 컨트롤러. 전체 상태·준비(Readiness)·생존(Liveness) 프로브 엔드포인트 제공.
 * 인증 불필요(@Public). 쿠버네티스/로드밸런서 헬스 체크 및 모니터링 용도.
 * DB, Redis, 외부 서비스 연결 상태를 종합하여 healthy/unhealthy 판정.
 */
@Controller("api/v1/health")
@ApiTags("Health")
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "전체 헬스 체크" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "서비스가 정상 작동 중",
    type: HealthResponse,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "서비스 또는 의존성이 비정상 상태",
  })
  async check(): Promise<HealthResponse> {
    const health = await this.healthService.getHealthStatus();
    if (health.status === "unhealthy") {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Get("ready")
  @ApiOperation({ summary: "준비 상태 체크 (Readiness Probe)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "트래픽 수신 준비 완료",
    type: HealthResponse,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "준비 미완료",
  })
  async readiness(): Promise<HealthResponse> {
    const health = await this.healthService.getHealthStatus();
    if (health.status === "unhealthy") {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "생존 상태 체크 (Liveness Probe)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "프로세스가 실행 중",
    schema: { example: { status: "alive" } },
  })
  liveness(): { status: string } {
    return { status: "alive" };
  }
}
