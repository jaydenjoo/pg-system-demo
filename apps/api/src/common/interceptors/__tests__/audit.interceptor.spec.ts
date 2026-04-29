// ============================================================
// AuditInterceptor 단위 테스트
// deriveAction / deriveResourceType / deriveResourceId 검증
// ============================================================
import {
  deriveAction,
  deriveResourceType,
  deriveResourceId,
} from '../audit.interceptor';

describe('deriveAction', () => {
  it('POST → CREATE', () => {
    expect(deriveAction('POST')).toBe('CREATE');
  });

  it('PUT → UPDATE', () => {
    expect(deriveAction('PUT')).toBe('UPDATE');
  });

  it('PATCH → UPDATE', () => {
    expect(deriveAction('PATCH')).toBe('UPDATE');
  });

  it('DELETE → DELETE', () => {
    expect(deriveAction('DELETE')).toBe('DELETE');
  });

  it('GET → READ', () => {
    expect(deriveAction('GET')).toBe('READ');
  });

  it('소문자 post → CREATE', () => {
    expect(deriveAction('post')).toBe('CREATE');
  });
});

describe('deriveResourceType', () => {
  // 관리자 API 경로 (/api/v*)
  it('/api/v1/users → USERS', () => {
    expect(deriveResourceType('/api/v1/users')).toBe('USERS');
  });

  it('/api/v1/merchants/abc-123 → MERCHANTS', () => {
    expect(deriveResourceType('/api/v1/merchants/abc-123')).toBe('MERCHANTS');
  });

  // PG Gateway 경로 (/pg/v*) — 정규식 확장 검증
  it('/pg/v1/payments → PAYMENTS', () => {
    expect(deriveResourceType('/pg/v1/payments')).toBe('PAYMENTS');
  });

  it('/pg/v1/payments/confirm → PAYMENTS', () => {
    expect(deriveResourceType('/pg/v1/payments/confirm')).toBe('PAYMENTS');
  });

  it('/pg/v1/webhooks/config → WEBHOOKS', () => {
    expect(deriveResourceType('/pg/v1/webhooks/config')).toBe('WEBHOOKS');
  });

  it('/pg/v1/virtual-accounts → VIRTUAL-ACCOUNTS', () => {
    expect(deriveResourceType('/pg/v1/virtual-accounts')).toBe('VIRTUAL-ACCOUNTS');
  });

  // 버전 숫자 다른 경우
  it('/pg/v2/payments → PAYMENTS', () => {
    expect(deriveResourceType('/pg/v2/payments')).toBe('PAYMENTS');
  });

  // 매칭 안 되는 경우
  it('/unknown/path → UNKNOWN', () => {
    expect(deriveResourceType('/unknown/path')).toBe('UNKNOWN');
  });

  it('빈 문자열 → UNKNOWN', () => {
    expect(deriveResourceType('')).toBe('UNKNOWN');
  });
});

describe('deriveResourceId', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('URL에 UUID 포함 → 해당 UUID 반환', () => {
    expect(deriveResourceId(`/pg/v1/payments/${UUID}/cancel`)).toBe(UUID);
  });

  it('UUID 없으면 undefined', () => {
    expect(deriveResourceId('/pg/v1/payments/confirm')).toBeUndefined();
  });

  it('querystring에 UUID 있어도 추출', () => {
    expect(deriveResourceId(`/api/v1/users?id=${UUID}`)).toBe(UUID);
  });
});
