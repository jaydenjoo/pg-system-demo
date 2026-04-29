import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request } from "express";
import {
  SecurityService,
  WriteAuditLogData,
} from "../../modules/security/security.service";
import { getCorrelationId } from "../context/correlation-id.context";

/** JWT 토큰에서 추출한 사용자 정보 (감사 로그용) */
export interface JwtUser {
  sub: string;
  loginId: string;
  userType: string;
}

/** HTTP 메서드 → 감사 액션 매핑 (POST→CREATE, PUT/PATCH→UPDATE, DELETE→DELETE, 그 외→READ) */
export function deriveAction(method: string): string {
  switch (method.toUpperCase()) {
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return "READ";
  }
}

/** URL 경로에서 리소스 타입 추출 (예: /api/v1/merchants → MERCHANTS) */
export function deriveResourceType(url: string): string {
  const match = /\/(?:api|pg)\/v\d+\/([^/?]+)/.exec(url);
  return match ? match[1].toUpperCase() : "UNKNOWN";
}

/** URL 경로에서 UUID 형식의 리소스 ID 추출. 없으면 undefined 반환. */
export function deriveResourceId(url: string): string | undefined {
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = uuidRegex.exec(url);
  return match ? match[0] : undefined;
}

/**
 * 감사 로그 인터셉터 — 모든 API 요청/응답을 자동으로 감사 로그에 기록.
 *
 * 요청 완료(tap) 후 fire-and-forget 방식으로 SecurityService.writeAuditLog를 호출.
 * 감사 로그 기록 실패가 API 응답에 영향을 주지 않도록 보장.
 *
 * @security PCI DSS 10.2 — 모든 사용자 접근 자동 기록
 * @audit correlationId로 요청 추적 가능
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Audit");

  constructor(private readonly securityService: SecurityService) {}

  /**
   * 요청 처리 후 감사 로그 비동기 기록.
   * @param context - NestJS 실행 컨텍스트 (HTTP method, URL, IP, User-Agent)
   * @param next - 다음 핸들러 체인
   * @returns Observable — 원본 응답을 변경하지 않음
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtUser }>();
    const { method, url, ip } = request;
    const userAgent = request.headers["user-agent"];
    const userId = request.user?.sub;

    return next.handle().pipe(
      tap(() => {
        const action = deriveAction(method);
        const resourceType = deriveResourceType(url);
        const resourceId = deriveResourceId(url);

        this.logger.log(
          `[AUDIT] correlationId=${getCorrelationId()} userId=${userId ?? "anonymous"} action=${action} resource=${resourceType} ip=${ip}`,
        );

        const auditData: WriteAuditLogData = {
          ...(userId !== undefined ? { userId } : {}),
          action,
          resourceType,
          ...(resourceId !== undefined ? { resourceId } : {}),
          ...(ip !== undefined ? { ipAddress: ip } : {}),
          ...(userAgent !== undefined
            ? { userAgent: userAgent.slice(0, 500) }
            : {}),
        };

        // Fire-and-forget — errors must not affect the response
        void this.securityService
          .writeAuditLog(auditData)
          .catch((err: unknown) => {
            this.logger.error(`Audit log write failed: ${String(err)}`);
          });
      }),
    );
  }
}
