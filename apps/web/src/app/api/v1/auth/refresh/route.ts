/**
 * POST /api/v1/auth/refresh
 * Refresh token으로 access token 재발급.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { decodeMockJwt, makeAccessToken, makeRefreshToken } from '../../_lib/mock-jwt';
import { setAuthCookies, clearAuthCookies } from '../../_lib/cookies';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refresh = request.cookies.get('refreshToken')?.value;
  if (refresh === undefined || refresh === '') {
    const response = NextResponse.json(
      { error: { code: 'NO_REFRESH_TOKEN', message: '재발급 토큰이 없습니다.' } },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  const payload = decodeMockJwt(refresh);
  if (payload === null) {
    const response = NextResponse.json(
      { error: { code: 'INVALID_REFRESH_TOKEN', message: '재발급 토큰이 만료되었습니다.' } },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  const tokenPayload = {
    userId: payload.userId,
    loginId: payload.loginId,
    userType: payload.userType,
    name: payload.name,
  };

  const newAccess = makeAccessToken(tokenPayload);
  const newRefresh = makeRefreshToken(tokenPayload);

  const response = NextResponse.json({
    data: { userType: payload.userType, userId: payload.userId },
  });
  setAuthCookies(response, newAccess, newRefresh);
  return response;
}
