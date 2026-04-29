import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";
import { MetricsService } from "../../modules/metrics/metrics.service";

/**
 * Prometheus 메트릭 수집 인터셉터 — 모든 HTTP 요청의 카운트/지연시간을 자동 측정.
 *
 * 수집 메트릭:
 * - http_requests_total (Counter): method, route, status_code 라벨
 * - http_request_duration_seconds (Histogram): method, route 라벨
 *
 * route는 Express route.path 사용으로 카디널리티를 낮춤 (예: /api/v1/users/:id)
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { route?: { path?: string } }>();
    const { method } = request;

    // route.path는 /:id 형태로 카디널리티를 낮춤 (동적 파라미터 치환)
    const route = request.route?.path ?? request.url.split("?")[0];
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = http.getResponse<Response>();
        const statusCode = String(response.statusCode);
        const durationSecs = (Date.now() - start) / 1000;

        this.metricsService.httpRequestsTotal.inc({
          method,
          route,
          status_code: statusCode,
        });

        this.metricsService.httpRequestDurationSeconds.observe(
          { method, route },
          durationSecs,
        );
      }),
    );
  }
}
