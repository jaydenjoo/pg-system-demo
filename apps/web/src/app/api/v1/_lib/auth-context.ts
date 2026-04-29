/**
 * 요청에서 현재 사용자를 추출하는 헬퍼.
 */
import type { NextRequest } from 'next/server';
import { decodeMockJwt, type MockJwtPayload } from './mock-jwt';

export function getCurrentUser(request: NextRequest): MockJwtPayload | null {
  const token = request.cookies.get('accessToken')?.value;
  if (token === undefined || token === '') return null;
  return decodeMockJwt(token);
}
