import { headers } from 'next/headers';

/**
 * 서버 컴포넌트에서 CSP nonce 값을 읽는 유틸리티
 * middleware.ts에서 설정한 x-nonce 헤더를 추출
 */
export async function getNonce(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get('x-nonce') ?? '';
}
