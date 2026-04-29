import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../../_lib/auth-context';
import { buildCommissionHistory } from '../../../../_lib/mock-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; id: string }> },
): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const { entityType, id } = await params;
  if (entityType !== 'agent' && entityType !== 'merchant') {
    return NextResponse.json(
      { error: { code: 'INVALID_TYPE', message: 'entityType은 agent 또는 merchant여야 합니다.' } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: buildCommissionHistory(entityType, id) });
}
