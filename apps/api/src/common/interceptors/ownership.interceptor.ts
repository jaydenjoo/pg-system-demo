import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { Request } from "express";
import { JwtPayload } from "../decorators/current-user.decorator";

/**
 * 데이터 소유권 강제 인터셉터.
 *
 * MERCHANT 유저 → query.merchantId를 JWT의 merchantId로 강제 덮어쓰기
 * AGENT 유저   → query.agentId를 JWT의 agentId로 강제 덮어쓰기
 * ADMIN 유저   → 제한 없음 (기존 동작 유지)
 *
 * 동작 원리: NestJS 실행순서(Guard → Interceptor → Pipe → Handler)에서
 * Interceptor가 request.query를 수정하면, 이후 Pipe(ValidationPipe)가
 * 수정된 query를 DTO로 변환하므로 서비스 코드 변경 없이 소유권 적용 가능.
 *
 * @security PCI DSS 7.1 - 최소 권한 원칙: 가맹점/대리점은 자기 데이터만 접근
 */
@Injectable()
export class OwnershipInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OwnershipInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    const user = request.user;
    if (!user) {
      return next.handle();
    }

    if (user.userType === "MERCHANT" && user.merchantId) {
      // Query params: merchantId를 자기 것으로 강제
      if (request.query["merchantId"] !== user.merchantId) {
        this.logger.warn(
          `Ownership override: MERCHANT user ${user.sub} tried merchantId=${String(request.query["merchantId"] ?? "none")}, forced to ${user.merchantId}`,
        );
      }
      request.query["merchantId"] = user.merchantId;
      delete request.query["agentId"];

      // Path params: /merchants/:merchantId → 타인 가맹점 접근 차단
      if (
        request.params["merchantId"] &&
        request.params["merchantId"] !== user.merchantId
      ) {
        this.logger.warn(
          `Ownership denied: MERCHANT user ${user.sub} tried path merchantId=${request.params["merchantId"]}`,
        );
        throw new ForbiddenException("접근 권한이 없습니다");
      }
    }

    if (user.userType === "AGENT" && user.agentId) {
      // Query params: agentId를 자기 것으로 강제
      if (request.query["agentId"] !== user.agentId) {
        this.logger.warn(
          `Ownership override: AGENT user ${user.sub} tried agentId=${String(request.query["agentId"] ?? "none")}, forced to ${user.agentId}`,
        );
      }
      request.query["agentId"] = user.agentId;

      // Path params: /agents/:agentId → 타인 대리점 접근 차단
      if (
        request.params["agentId"] &&
        request.params["agentId"] !== user.agentId
      ) {
        this.logger.warn(
          `Ownership denied: AGENT user ${user.sub} tried path agentId=${request.params["agentId"]}`,
        );
        throw new ForbiddenException("접근 권한이 없습니다");
      }
    }

    return next.handle();
  }
}
