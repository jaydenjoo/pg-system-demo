import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/** Prisma Decimal 타입 여부 판별. d(digits)/e(exponent)/s(sign) 프로퍼티와 toNumber 메서드 존재 시 true. */
function isPrismaDecimal(obj: unknown): obj is { toNumber(): number } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "d" in obj &&
    "e" in obj &&
    "s" in obj &&
    typeof (obj as Record<string, unknown>).toNumber === "function"
  );
}

/**
 * 객체 트리를 재귀 순회하며 BigInt → Number, Prisma Decimal → Number로 변환.
 * Date 인스턴스는 변환하지 않고 원본 유지.
 */
function convertBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (isPrismaDecimal(obj)) return obj.toNumber();
  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (obj instanceof Date) return obj;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
}

/**
 * BigInt/Decimal 직렬화 인터셉터 — JSON 직렬화 불가 타입을 Number로 변환.
 *
 * PostgreSQL의 BIGINT(잔액·금액) 컬럼과 Prisma Decimal 타입은
 * JSON.stringify 시 에러를 발생시키므로, 응답 파이프라인에서 자동 변환.
 */
@Injectable()
export class BigIntSerializationInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(convertBigInts));
  }
}
