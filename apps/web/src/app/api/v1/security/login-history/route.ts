import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { paginate, readPagination } from '../../_lib/mock-data';

export const runtime = 'nodejs';

const MOCK_LOGIN_HISTORY = Array.from({ length: 10 }, (_, i) => ({
  id: `lh-${String(i + 1).padStart(4, '0')}`,
  userId: 'mock-admin-001',
  loginId: 'admin',
  ipAddress: `192.168.0.${10 + i}`,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120',
  success: i !== 3,
  failReason: i === 3 ? 'INVALID_PASSWORD' : null,
  loginAt: new Date(Date.now() - i * 1000 * 60 * 60 * 4).toISOString(),
}));

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { page, limit } = readPagination(request.nextUrl.searchParams);
  return NextResponse.json(paginate(MOCK_LOGIN_HISTORY, page, limit));
}
