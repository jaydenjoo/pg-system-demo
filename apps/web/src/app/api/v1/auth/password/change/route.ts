/**
 * POST /api/v1/auth/password/change
 * 비밀번호 변경 (데모: 항상 성공).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '../../../_lib/auth-context';

export const runtime = 'nodejs';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const claims = getCurrentUser(request);
  if (claims === null) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: '요청 형식이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: '비밀번호는 최소 8자 이상이어야 합니다.' } },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: { success: true } });
}
