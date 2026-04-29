/**
 * GET /api/v1/auth/me
 * 현재 로그인된 사용자 정보 반환.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { findUserById } from '../../_lib/mock-users';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const claims = getCurrentUser(request);
  if (claims === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }

  const user = findUserById(claims.userId);
  if (user === null) {
    return NextResponse.json(
      { error: { code: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      userId: user.userId,
      loginId: user.loginId,
      userType: user.userType,
      name: user.name,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
    },
  });
}
