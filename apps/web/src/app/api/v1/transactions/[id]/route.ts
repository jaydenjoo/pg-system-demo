import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { MOCK_TRANSACTIONS } from '../../_lib/mock-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const transaction = MOCK_TRANSACTIONS.find((t) => t.id === id);
  if (!transaction) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: '거래를 찾을 수 없습니다.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: transaction });
}
