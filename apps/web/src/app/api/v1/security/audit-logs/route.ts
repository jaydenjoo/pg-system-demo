import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { paginate, readPagination } from '../../_lib/mock-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOCK_AUDIT = Array.from({ length: 12 }, (_, i) => ({
  id: `audit-${String(i + 1).padStart(4, '0')}`,
  userId: 'mock-admin-001',
  userName: '시스템 관리자',
  action: ['LOGIN', 'CREATE_MERCHANT', 'UPDATE_SETTLEMENT', 'VIEW_TRANSACTION'][i % 4],
  targetType: ['USER', 'MERCHANT', 'SETTLEMENT', 'TRANSACTION'][i % 4],
  targetId: `target-${i + 1}`,
  ipAddress: `192.168.0.${10 + i}`,
  createdAt: new Date(Date.now() - i * 1000 * 60 * 30).toISOString(),
}));

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { page, limit } = readPagination(request.nextUrl.searchParams);
  return NextResponse.json(paginate(MOCK_AUDIT, page, limit));
}
