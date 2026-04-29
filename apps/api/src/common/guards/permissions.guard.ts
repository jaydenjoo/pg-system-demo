import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ERROR_CODES, PermissionCode } from '@pg-system/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * 권한 검증 가드 — RBAC(역할 기반 접근 제어) 구현.
 *
 * 컨트롤러/핸들러에 @RequirePermissions() 데코레이터로 지정된 권한 코드를
 * JWT 페이로드의 permissions 배열과 대조합니다.
 * 필요 권한 중 하나라도 보유하면 통과 (OR 로직).
 *
 * @security 권한 미설정 핸들러는 인증만으로 접근 허용 (기본 허용)
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * 요청자의 권한을 검증.
   * @param context - NestJS 실행 컨텍스트 (request.user 접근)
   * @returns true: 접근 허용
   * @throws ForbiddenException 필요 권한 미보유 시
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_008,
        message: '권한이 없습니다',
      });
    }

    // permissions 배열에서 필요한 권한 중 하나라도 있는지 확인
    const hasPermission = requiredPermissions.some((requiredPerm) =>
      user.permissions.includes(requiredPerm),
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        code: ERROR_CODES.AUTH_008,
        message: '권한이 없습니다',
      });
    }

    return true;
  }
}
