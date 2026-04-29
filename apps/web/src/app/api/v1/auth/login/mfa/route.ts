/**
 * POST /api/v1/auth/login/mfa
 * MFA 코드 검증 (데모 전용: 6자리 숫자면 OK).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { findUserById } from '../../../_lib/mock-users';
import { makeAccessToken, makeRefreshToken } from '../../../_lib/mock-jwt';
import { setAuthCookies } from '../../../_lib/cookies';

export const runtime = 'nodejs';

const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '6자리 숫자를 입력해주세요'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const parsed = mfaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'MFA 코드는 6자리 숫자입니다.' } },
      { status: 400 },
    );
  }

  const pendingUserId = request.cookies.get('mfaPendingUserId')?.value;
  if (pendingUserId === undefined || pendingUserId === '') {
    return NextResponse.json(
      { error: { code: 'NO_PENDING_LOGIN', message: '로그인을 먼저 시도해주세요.' } },
      { status: 401 },
    );
  }

  const user = findUserById(pendingUserId);
  if (user === null) {
    return NextResponse.json(
      { error: { code: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }

  const tokenPayload = {
    userId: user.userId,
    loginId: user.loginId,
    userType: user.userType,
    name: user.name,
  };

  const response = NextResponse.json({
    data: { userType: user.userType, userId: user.userId },
  });
  setAuthCookies(response, makeAccessToken(tokenPayload), makeRefreshToken(tokenPayload));
  response.cookies.set('mfaPendingUserId', '', { path: '/', maxAge: 0 });
  return response;
}
