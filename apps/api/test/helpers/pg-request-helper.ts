// ============================================================
// PG Basic Auth 요청 헬퍼 — E2E 테스트 공통
// secretKey를 Base64(secretKey:)로 인코딩하여 Authorization 헤더 설정
// ============================================================
import request from 'supertest';

type HttpServer = Parameters<typeof request>[0];

/** PG Basic Auth 요청 헬퍼 */
export function pgRequest(
  server: HttpServer,
  method: 'get' | 'post' | 'delete',
  url: string,
  secretKey: string,
): request.Test {
  const encoded = Buffer.from(`${secretKey}:`).toString('base64');
  return request(server)[method](url).set('Authorization', `Basic ${encoded}`);
}
