import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../_lib/auth-context';
import { MOCK_SETTLEMENTS, paginate, readPagination } from '../_lib/mock-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const sp = request.nextUrl.searchParams;
  const { page, limit } = readPagination(sp);
  let items = MOCK_SETTLEMENTS;
  const status = sp.get('status');
  if (status) items = items.filter((s) => s.status === status);
  const merchantId = sp.get('merchantId');
  if (merchantId) items = items.filter((s) => s.merchant_id === merchantId);
  return NextResponse.json(paginate(items, page, limit));
}
