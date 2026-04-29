import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

/** JWT 토큰에서 추출한 사용자 정보. JwtAuthGuard 통과 후 request.user에 주입됨. */
export interface JwtPayload {
  sub: string;
  loginId: string;
  userType: "ADMIN" | "AGENT" | "MERCHANT";
  roles: string[];
  permissions: string[];
  /** 가맹점 유저의 소속 가맹점 ID (데이터 소유권 검증용) */
  merchantId?: string;
  /** 대리점 유저의 소속 대리점 ID (데이터 소유권 검증용) */
  agentId?: string;
}

/**
 * 현재 사용자 파라미터 데코레이터 — 컨트롤러 메서드에서 JWT 페이로드를 직접 주입.
 *
 * @example `@CurrentUser() user: JwtPayload` — request.user 대신 깔끔하게 접근
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
