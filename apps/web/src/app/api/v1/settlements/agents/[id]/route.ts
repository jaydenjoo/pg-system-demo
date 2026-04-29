import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../_lib/auth-context';
import { MOCK_AGENT_SETTLEMENTS, paginate, readPagination } from '../../../_lib/mock-data';

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
  const sp = request.nextUrl.searchParams;
  const { page, limit } = readPagination(sp);
  const items = MOCK_AGENT_SETTLEMENTS.filter((s) => s.agent_id === id);
  return NextResponse.json(paginate(items, page, limit));
}
