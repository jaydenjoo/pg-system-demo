import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { MOCK_USERS_LIST } from '../../_lib/mock-data';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { id } = await params;
  const user = MOCK_USERS_LIST.find((u) => u.id === id);
  if (!user) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: user });
}
