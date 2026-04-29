// ============================================================
// PgBasicAuthGuard 단위 테스트
// Basic Auth 파싱 + request.user 설정(AuditInterceptor 연동) 검증
// ============================================================
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PgBasicAuthGuard } from '../guards/pg-basic-auth.guard';
import type { PgAuthenticatedRequest } from '../guards/pg-basic-auth.guard';

// ---- 상수 ----
const MERCHANT_ID = 'merchant-uuid-001';
const API_KEY_ID = 'apikey-uuid-001';
const CLIENT_KEY = 'client-key-abc';
const SECRET_KEY = 'test-secret-key-12345';

// ---- ApiKeyService Mock ----
const mockApiKeyService = {
  validateSecretKey: jest.fn(),
};

// ---- 헬퍼: ExecutionContext Mock ----
function makeContext(authHeader?: string): ExecutionContext {
  const request: Partial<PgAuthenticatedRequest> = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request as PgAuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

function makeBasicHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

// ============================================================
describe('PgBasicAuthGuard', () => {
  let guard: PgBasicAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PgBasicAuthGuard(mockApiKeyService as never);
  });

  // TC-G01: 정상 인증 — request 필드 주입 검증
  it('TC-G01: 유효한 secretKey → request 필드 정상 주입', async () => {
    mockApiKeyService.validateSecretKey.mockResolvedValue({
      merchantId: MERCHANT_ID,
      id: API_KEY_ID,
      clientKey: CLIENT_KEY,
    });

    const ctx = makeContext(makeBasicHeader(SECRET_KEY));
    const request = ctx.switchToHttp().getRequest<PgAuthenticatedRequest>();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.pgMerchantId).toBe(MERCHANT_ID);
    expect(request.pgApiKeyId).toBe(API_KEY_ID);
    expect(request.pgClientKey).toBe(CLIENT_KEY);
  });

  // TC-G02: AuditInterceptor 연동 — request.user.sub = merchantId
  it('TC-G02: 인증 성공 시 request.user.sub 에 merchantId 기록', async () => {
    mockApiKeyService.validateSecretKey.mockResolvedValue({
      merchantId: MERCHANT_ID,
      id: API_KEY_ID,
      clientKey: CLIENT_KEY,
    });

    const ctx = makeContext(makeBasicHeader(SECRET_KEY));
    const request = ctx.switchToHttp().getRequest<PgAuthenticatedRequest>();

    await guard.canActivate(ctx);

    expect(request.user).toBeDefined();
    expect(request.user?.sub).toBe(MERCHANT_ID);
    expect(request.user?.loginId).toBe(API_KEY_ID);
    expect(request.user?.userType).toBe('MERCHANT');
  });

  // TC-G03: Authorization 헤더 없음 → 401
  it('TC-G03: Authorization 헤더 없음 → UnauthorizedException', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // TC-G04: Basic 접두어 없음 → 401
  it('TC-G04: Bearer 토큰 전달 시 → UnauthorizedException', async () => {
    const ctx = makeContext('Bearer some-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // TC-G05: 유효하지 않은 secretKey → 401
  it('TC-G05: validateSecretKey가 null 반환 → UnauthorizedException', async () => {
    mockApiKeyService.validateSecretKey.mockResolvedValue(null);
    const ctx = makeContext(makeBasicHeader('invalid-key'));
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  // TC-G06: secretKey: 형식 (콜론 포함) 도 정상 처리
  it('TC-G06: base64("secretKey:") 형식도 정상 파싱', async () => {
    mockApiKeyService.validateSecretKey.mockResolvedValue({
      merchantId: MERCHANT_ID,
      id: API_KEY_ID,
      clientKey: CLIENT_KEY,
    });

    const encoded = Buffer.from(`${SECRET_KEY}:`).toString('base64');
    const ctx = makeContext(`Basic ${encoded}`);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockApiKeyService.validateSecretKey).toHaveBeenCalledWith(SECRET_KEY);
  });
});
