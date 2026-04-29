import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { requestContext } from "../context/correlation-id.context";

/**
 * 요청 추적 미들웨어 — 모든 HTTP 요청에 고유 correlationId를 부여.
 *
 * 동작:
 * 1. 클라이언트가 X-Correlation-ID 헤더를 보내면 그대로 사용 (분산 추적)
 * 2. 없으면 UUID v4를 생성
 * 3. 응답 헤더에 X-Correlation-ID를 포함하여 클라이언트가 추적 가능
 * 4. AsyncLocalStorage에 저장하여 로거/감사로그에서 자동 참조
 *
 * @audit 감사 로그, 에러 로그, 메트릭에서 correlationId로 요청 전체 흐름 추적
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers["x-correlation-id"] as string) ?? randomUUID();
    res.setHeader("x-correlation-id", correlationId);
    requestContext.run({ correlationId }, () => next());
  }
}
