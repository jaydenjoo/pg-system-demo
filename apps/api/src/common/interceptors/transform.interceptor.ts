import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ApiResponse, PaginationMeta } from "@pg-system/shared";

/** 서비스 계층에서 반환하는 원본 응답 구조 */
export interface ResponseData<T> {
  data: T;
  meta?: PaginationMeta;
}

/**
 * 응답 변환 인터셉터 — 모든 API 응답을 표준 ApiResponse 봉투(envelope)로 래핑.
 *
 * 변환 규칙:
 * - { data, meta } → { success: true, data, meta }
 * - null/undefined → { success: true, data: null }
 *
 * 에러 응답은 GlobalExceptionFilter에서 처리하므로 이 인터셉터를 거치지 않음.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  ResponseData<T>,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<ResponseData<T>>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        if (result === undefined || result === null) {
          return { success: true as const, data: null as unknown as T };
        }
        return {
          success: true as const,
          data: result.data,
          ...(result.meta !== undefined ? { meta: result.meta } : {}),
        };
      }),
    );
  }
}
