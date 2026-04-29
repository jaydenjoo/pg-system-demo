/**
 * POST /api/v1/auth/logout
 * 인증 쿠키 제거.
 */
import { NextResponse } from 'next/server';
import { clearAuthCookies } from '../../_lib/cookies';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ data: { success: true } });
  clearAuthCookies(response);
  return response;
}
