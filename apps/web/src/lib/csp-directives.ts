/**
 * CSP 디렉티브 생성 유틸리티
 * PCI DSS 6.4.3 준수: nonce 기반 스크립트 제어
 *
 * Edge Runtime 호환 — Node.js 전용 API 미사용
 * middleware.ts와 테스트 양쪽에서 import하여 동기화 보장
 */

/**
 * 일반 페이지용 CSP (iframe 임베딩 차단)
 */
export function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}

/**
 * 결제 iframe용 CSP (가맹점 사이트에서 임베딩 허용)
 * frame-ancestors를 열어 SDK/iframe 결제창 임베딩 가능
 * 실제 도메인 검증은 postMessage origin 검증에서 처리
 */
export function buildCheckoutIframeCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors *",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}
