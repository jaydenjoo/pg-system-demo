/**
 * POST /api/v1/auth/mfa/setup
 * MFA 시드/QR (데모: 고정 시크릿 반환).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../_lib/auth-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const claims = getCurrentUser(request);
  if (claims === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  return NextResponse.json({
    data: {
      secret: 'JBSWY3DPEHPK3PXP',
      qrCodeUrl: 'otpauth://totp/PG%20System:demo?secret=JBSWY3DPEHPK3PXP&issuer=PG%20System',
    },
  });
}
