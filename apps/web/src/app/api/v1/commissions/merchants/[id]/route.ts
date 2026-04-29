import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../../../_lib/auth-context';
import { MOCK_MERCHANT_COMMISSIONS_BY_MERCHANT } from '../../../_lib/mock-data';

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
  return NextResponse.json({ data: MOCK_MERCHANT_COMMISSIONS_BY_MERCHANT[id] ?? [] });
}

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
  const body = (await request.json()) as { paymentMethod?: string; cardCompany?: string; commissionRate?: string };

  return NextResponse.json({
    data: {
      id: `mcomm-new-${Date.now()}`,
      merchant_id: id,
      payment_method: body.paymentMethod ?? 'CARD',
      card_company: body.cardCompany ?? null,
      commission_rate: body.commissionRate ?? '2.80',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'mock-admin-001',
    },
  });
}
