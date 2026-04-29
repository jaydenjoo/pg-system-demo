import { SetMetadata } from "@nestjs/common";

/** 메타데이터 키 — JwtAuthGuard에서 이 키로 공개 엔드포인트 여부를 확인. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * 공개 엔드포인트 데코레이터 — JWT 인증 없이 접근을 허용.
 * JwtAuthGuard가 이 메타데이터를 확인하여 인증을 건너뜀.
 *
 * @example `@Public() @Post('login')` — 로그인 엔드포인트
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
