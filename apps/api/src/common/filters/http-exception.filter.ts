import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ERROR_CODES, type ErrorCode } from "@pg-system/shared";
import { getCorrelationId } from "../context/correlation-id.context";

/**
 * 전역 예외 필터 — 모든 예외를 표준 에러 응답 형식으로 변환.
 *
 * 처리 규칙:
 * - HttpException → 상태코드/에러코드/메시지 추출하여 반환
 * - 그 외 예외 → 500 + INTERNAL_ERROR (내부 정보 미노출, 스택트레이스는 서버 로그에만 기록)
 *
 * @security 내부 에러 상세(스택트레이스, DB 구조)를 클라이언트에 절대 노출하지 않음
 * @audit correlationId를 로그에 포함하여 요청 추적 가능
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ERROR_CODES.INTERNAL_ERROR;
    let message = "내부 서버 오류가 발생했습니다";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        code = (resp["code"] as ErrorCode) ?? code;
        message = (resp["message"] as string) ?? exception.message;
      } else {
        message = exception.message;
      }
    } else {
      // 내부 에러는 사용자에게 상세 정보 노출 금지 (보안 규칙)
      this.logger.error(
        `Unhandled exception: correlationId=${getCorrelationId()} ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
        `${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}
