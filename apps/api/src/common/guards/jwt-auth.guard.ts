import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ERROR_CODES } from '@pg-system/shared';

/**
 * JWT 인증 가드 — 관리자 API 전체에 적용.
 *
 * Passport 'jwt' 전략이 Authorization 헤더의 Bearer 토큰을 검증한 뒤,
 * 유효한 사용자 객체를 request.user에 주입합니다.
 * 토큰이 없거나 만료된 경우 AUTH_001 에러를 반환합니다.
 *
 * @security JWT Access Token 만료: 15분 (auth.module에서 설정)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Passport 검증 결과를 처리. 인증 실패 시 UnauthorizedException 발생.
   * @param err - Passport 전략에서 발생한 에러 (없으면 null)
   * @param user - 검증된 사용자 객체 (JwtPayload)
   * @returns 검증된 사용자 객체
   * @throws UnauthorizedException 토큰 미제공/만료/무효 시
   */
  handleRequest<T>(err: Error | null, user: T): T {
    if (err !== null || !user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.AUTH_001,
        message: '인증이 필요합니다',
      });
    }
    return user;
  }
}
