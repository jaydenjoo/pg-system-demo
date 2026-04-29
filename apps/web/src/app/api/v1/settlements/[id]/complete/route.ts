import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../_lib/auth-context';

export const runtime = 'nodejs';

export async function POST(
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
  return NextResponse.json({ data: { id, status: 'COMPLETED' } });
}
