import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';

export const runtime = 'nodejs';

const MOCK_MENUS = [
  { id: 'menu-1', code: 'DASHBOARD', name: '대시보드', path: '/dashboard', icon: 'home', sortOrder: 1 },
  { id: 'menu-2', code: 'MERCHANTS', name: '가맹점 관리', path: '/merchants', icon: 'store', sortOrder: 2 },
  { id: 'menu-3', code: 'AGENTS', name: '대리점 관리', path: '/agents', icon: 'users', sortOrder: 3 },
  { id: 'menu-4', code: 'TRANSACTIONS', name: '거래 내역', path: '/transactions', icon: 'list', sortOrder: 4 },
  { id: 'menu-5', code: 'SETTLEMENTS', name: '정산 관리', path: '/settlements', icon: 'check', sortOrder: 5 },
  { id: 'menu-6', code: 'DEPOSITS', name: '입금 관리', path: '/deposits', icon: 'wallet', sortOrder: 6 },
  { id: 'menu-7', code: 'SECURITY', name: '보안', path: '/security', icon: 'shield', sortOrder: 7 },
  { id: 'menu-8', code: 'SYSTEM', name: '시스템', path: '/system', icon: 'cog', sortOrder: 8 },
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: MOCK_MENUS });
}
