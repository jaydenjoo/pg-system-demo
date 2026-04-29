/**
 * Mock API용 쿠키 설정 헬퍼.
 * HttpOnly + SameSite=Lax. Vercel 배포(HTTPS)에서는 Secure도 추가.
 */
import type { NextResponse } from 'next/server';

const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 7;

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set('accessToken', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SEC,
  });

  response.cookies.set('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SEC,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set('accessToken', '', { path: '/', maxAge: 0 });
  response.cookies.set('refreshToken', '', { path: '/', maxAge: 0 });
}
