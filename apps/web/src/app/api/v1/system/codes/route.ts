import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../_lib/auth-context';
import { MOCK_SYSTEM_CODES, paginate, readPagination } from '../../_lib/mock-data';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { page, limit } = readPagination(request.nextUrl.searchParams);
  const groupParam = request.nextUrl.searchParams.get('codeGroup');
  const filtered =
    groupParam !== null && groupParam !== ''
      ? MOCK_SYSTEM_CODES.filter((c) => c.codeGroup === groupParam)
      : MOCK_SYSTEM_CODES;
  return NextResponse.json(paginate(filtered, page, limit));
}
