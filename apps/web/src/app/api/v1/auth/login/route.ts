/**
 * POST /api/v1/auth/login
 * 데모 전용 mock 로그인. seed 계정으로 로그인 가능.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { findUserByCredentials } from '../../_lib/mock-users';
import { makeAccessToken, makeRefreshToken, type MockJwtPayload } from '../../_lib/mock-jwt';
import { setAuthCookies } from '../../_lib/cookies';

export const runtime = 'nodejs';

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: '아이디와 비밀번호를 입력해주세요.' } },
      { status: 400 },
    );
  }

  const user = findUserByCredentials(parsed.data.loginId, parsed.data.password);
  if (user === null) {
    return NextResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: '아이디 또는 비밀번호가 일치하지 않습니다.' } },
      { status: 401 },
    );
  }

  const tokenPayload: MockJwtPayload = {
    userId: user.userId,
    loginId: user.loginId,
    userType: user.userType,
    name: user.name,
  };

  if (user.mfaEnabled) {
    const response = NextResponse.json({
      data: {
        requireMfa: true,
        userType: user.userType,
      },
    });
    response.cookies.set('mfaPendingUserId', user.userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 5 * 60,
    });
    return response;
  }

  const accessToken = makeAccessToken(tokenPayload);
  const refreshToken = makeRefreshToken(tokenPayload);

  const response = NextResponse.json({
    data: {
      requireMfa: false,
      userType: user.userType,
      userId: user.userId,
      name: user.name,
    },
  });
  setAuthCookies(response, accessToken, refreshToken);
  return response;
}
