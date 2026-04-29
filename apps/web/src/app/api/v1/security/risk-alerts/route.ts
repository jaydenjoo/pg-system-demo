import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { paginate, readPagination } from '../../_lib/mock-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOCK_RISK_ALERTS = [
  { id: 'risk-001', severity: 'high' as const, type: 'UNUSUAL_AMOUNT', description: '평소보다 5배 큰 금액 결제', merchantId: 'mch-002', merchantName: '서울 베이커리', createdAt: '2026-04-29T07:30:00.000Z', resolved: false },
  { id: 'risk-002', severity: 'medium' as const, type: 'MULTIPLE_FAIL', description: '5분 내 결제 실패 5회', merchantId: 'mch-003', merchantName: '동대문 의류', createdAt: '2026-04-28T22:15:00.000Z', resolved: false },
  { id: 'risk-003', severity: 'low' as const, type: 'NEW_DEVICE', description: '새로운 기기에서 로그인', merchantId: null, merchantName: null, createdAt: '2026-04-28T14:00:00.000Z', resolved: true },
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { page, limit } = readPagination(request.nextUrl.searchParams);
  return NextResponse.json(paginate(MOCK_RISK_ALERTS, page, limit));
}
