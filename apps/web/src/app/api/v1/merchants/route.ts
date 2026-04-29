import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../_lib/auth-context';
import { MOCK_MERCHANTS, paginate, readPagination, applySearch, applyStatusFilter } from '../_lib/mock-data';

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
  let items = MOCK_MERCHANTS;
  items = applySearch(items, sp.get('search'));
  items = applyStatusFilter(items, sp.get('status'));
  const agentId = sp.get('agentId');
  if (agentId) items = items.filter((m) => m.agent_id === agentId);
  return NextResponse.json(paginate(items, page, limit));
}
