import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hello: string }> },
): Promise<NextResponse> {
  const { hello } = await params;
  return NextResponse.json({ hello, timestamp: new Date().toISOString() });
}
