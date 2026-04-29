import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../_lib/auth-context';
import { MOCK_TRANSACTIONS, paginate, readPagination } from '../_lib/mock-data';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (getCurrentUser(request) === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }
  const sp = request.nextUrl.searchParams;
  const { page, limit } = readPagination(sp);
  let items = MOCK_TRANSACTIONS;

  const search = sp.get('search');
  if (search) {
    const q = search.trim().toLowerCase();
    items = items.filter((t) =>
      t.tran_no.toLowerCase().includes(q) ||
      t.order_no.toLowerCase().includes(q) ||
      (t.merchants?.merchant_name?.toLowerCase().includes(q) ?? false),
    );
  }

  const status = sp.get('status');
  if (status) items = items.filter((t) => t.status === status);

  const paymentMethod = sp.get('paymentMethod');
  if (paymentMethod) items = items.filter((t) => t.payment_method === paymentMethod);

  const merchantId = sp.get('merchantId');
  if (merchantId) items = items.filter((t) => t.merchant_id === merchantId);

  return NextResponse.json(paginate(items, page, limit));
}
