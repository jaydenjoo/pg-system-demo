// ============================================================
// PG Gateway — IP 화이트리스트 가드 단위 테스트 (PCI DSS 1.3.2)
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../../modules/security/security.service';

// ---- Prisma Mock ----
const mockPrisma = {
  pg_api_keys: {
    findUnique: jest.fn(),
  },
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- ExecutionContext 헬퍼 ----
const makeContext = (
  overrides: {
    pgApiKeyId?: string;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): ExecutionContext => {
  const req = {
    pgApiKeyId: overrides.pgApiKeyId,
    ip: overrides.ip ?? '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    headers: overrides.headers ?? {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
};

describe('IpWhitelistGuard', () => {
  let guard: IpWhitelistGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpWhitelistGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    guard = module.get<IpWhitelistGuard>(IpWhitelistGuard);
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('pgApiKeyId가 없으면(퍼블릭 엔드포인트) DB 조회 없이 통과한다', async () => {
      const ctx = makeContext({});

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPrisma.pg_api_keys.findUnique).not.toHaveBeenCalled();
    });

    it('allowed_ips가 빈 배열이면 모든 IP를 허용한다', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue({ allowed_ips: [] });
      const ctx = makeContext({ pgApiKeyId: 'api-key-uuid-1', ip: '1.2.3.4' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('클라이언트 IP가 화이트리스트에 포함되면 허용한다', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue({
        allowed_ips: ['192.168.1.100', '10.0.0.1'],
      });
      const ctx = makeContext({ pgApiKeyId: 'api-key-uuid-1', ip: '192.168.1.100' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('클라이언트 IP가 화이트리스트에 없으면 ForbiddenException을 던진다', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue({
        allowed_ips: ['10.0.0.1'],
      });
      const ctx = makeContext({ pgApiKeyId: 'api-key-uuid-1', ip: '192.168.1.100' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('IP 차단 시 감사 로그(AUDIT_ACTIONS.IP_WHITELIST_BLOCKED)를 기록한다 (PCI DSS 10.2.1)', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue({
        allowed_ips: ['10.0.0.1'],
      });
      mockSecurity.writeAuditLog.mockResolvedValue(undefined);
      const ctx = makeContext({ pgApiKeyId: 'api-key-uuid-1', ip: '192.168.1.100' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      // fire-and-forget이므로 비동기 완료까지 대기
      await Promise.resolve();

      expect(mockSecurity.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'IP_WHITELIST_BLOCKED',
          resourceType: 'pg_api_keys',
          resourceId: 'api-key-uuid-1',
          ipAddress: '192.168.1.100',
        }),
      );
    });

    it('trust proxy 적용된 req.ip를 사용하여 클라이언트 IP를 검증한다', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue({
        allowed_ips: ['203.0.113.10'],
      });
      // trust proxy 설정 시 Express가 req.ip에 실제 클라이언트 IP를 세팅
      const ctx = makeContext({
        pgApiKeyId: 'api-key-uuid-1',
        ip: '203.0.113.10',
      });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('API 키 메타데이터를 DB에서 찾지 못하면 통과한다', async () => {
      mockPrisma.pg_api_keys.findUnique.mockResolvedValue(null);
      const ctx = makeContext({ pgApiKeyId: 'api-key-uuid-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });
});
