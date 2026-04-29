import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';

export const runtime = 'nodejs';

const MOCK_NOTIFICATIONS = [
  { id: 'noti-1', title: '미정산 입금 2건', message: '입금 매칭이 필요합니다.', severity: 'warning' as const, read: false, createdAt: '2026-04-29T08:30:00.000Z' },
  { id: 'noti-2', title: '정산 완료 1,102건', message: '오늘 정산이 완료되었습니다.', severity: 'info' as const, read: false, createdAt: '2026-04-29T06:00:00.000Z' },
  { id: 'noti-3', title: '시스템 점검 안내', message: '5월 1일 새벽 2시~4시 점검 예정', severity: 'info' as const, read: true, createdAt: '2026-04-28T18:00:00.000Z' },
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: MOCK_NOTIFICATIONS });
}
