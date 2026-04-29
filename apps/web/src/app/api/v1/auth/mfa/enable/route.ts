/**
 * POST /api/v1/auth/mfa/enable
 * MFA 활성화 (데모: 항상 성공).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../_lib/auth-context';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const claims = getCurrentUser(request);
  if (claims === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: { mfaEnabled: true } });
}
