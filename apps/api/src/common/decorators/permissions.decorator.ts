import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '@pg-system/shared';

/** 메타데이터 키 — PermissionsGuard에서 이 키로 필요 권한 목록을 조회. */
export const PERMISSIONS_KEY = 'permissions';

/**
 * 권한 요구 데코레이터 — 컨트롤러/핸들러에 필요 권한 코드를 지정.
 * PermissionsGuard와 조합하여 RBAC(역할 기반 접근 제어)를 구현.
 *
 * @example `@RequirePermissions(PermissionCode.MERCHANT_READ, PermissionCode.MERCHANT_WRITE)`
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
