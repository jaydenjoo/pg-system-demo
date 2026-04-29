import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { MetricsService } from "./metrics.service";
import { MetricsIpGuard } from "./guards/metrics-ip.guard";

/**
 * Prometheus 메트릭 엔드포인트.
 * @Public + MetricsIpGuard — JWT 인증 불필요, IP 화이트리스트로 접근 제한.
 * @security PCI DSS 7.1 — 내부 운영 데이터 접근 제한
 */
@Controller("metrics")
@ApiTags("Metrics")
@Public()
@UseGuards(MetricsIpGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Prometheus 메트릭 조회" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Prometheus 형식의 메트릭 데이터 반환",
    schema: { example: "# TYPE process_cpu_usage_seconds_total counter\n..." },
  })
  async getMetrics(@Res() res: Response): Promise<void> {
    const [metrics, contentType] = await Promise.all([
      this.metricsService.getMetrics(),
      Promise.resolve(this.metricsService.getContentType()),
    ]);
    res.setHeader("Content-Type", contentType);
    res.end(metrics);
  }
}
