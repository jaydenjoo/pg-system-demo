/**
 * Mock JWT 생성 유틸리티 (Demo 전용).
 * 실제 서명 검증은 백엔드가 담당. 여기는 데모용 base64URL 인코딩만 수행.
 * Edge Runtime 호환 (atob/btoa 사용).
 */

export interface MockJwtPayload {
  userId: string;
  loginId: string;
  userType: 'ADMIN' | 'AGENT' | 'MERCHANT';
  name: string;
  exp?: number;
  iat?: number;
}

const MOCK_SIGNATURE = 'mock-signature-not-validated-in-demo';
const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1시간
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7일

function base64UrlEncode(input: string): string {
  // UTF-8 안전: TextEncoder로 바이트 변환 후 base64 인코딩
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function makeMockJwt(payload: MockJwtPayload, ttlSec = ACCESS_TOKEN_TTL_SEC): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttlSec };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  return `${encodedHeader}.${encodedPayload}.${MOCK_SIGNATURE}`;
}

export function makeAccessToken(payload: MockJwtPayload): string {
  return makeMockJwt(payload, ACCESS_TOKEN_TTL_SEC);
}

export function makeRefreshToken(payload: MockJwtPayload): string {
  return makeMockJwt(payload, REFRESH_TOKEN_TTL_SEC);
}

export function decodeMockJwt(token: string): MockJwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = JSON.parse(base64UrlDecode(parts[1])) as MockJwtPayload;

    if (typeof decoded.exp === 'number' && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
