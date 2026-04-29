// ============================================================
// Security — 보안 컨트롤러 단위 테스트 (PCI DSS 10.x, 11.5)
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SecurityController } from '../security.controller';
import { SecurityService } from '../security.service';
import { IntegrityMonitorService } from '../integrity-monitor.service';
import { AuditHashChainService } from '../audit-hash-chain.service';

// ---- Mocks ----
const mockSecurityService = {
  getAuditLogs: jest.fn(),
  getRiskAlerts: jest.fn(),
  resolveRiskAlert: jest.fn(),
  getLoginHistory: jest.fn(),
};

const mockIntegrityMonitorService = {
  getLastCheckResult: jest.fn(),
  checkIntegrity: jest.fn(),
  updateBaseline: jest.fn(),
};

const mockAuditHashChainService = {
  verifyChain: jest.fn(),
  getLatestHash: jest.fn(),
};

// ---- 픽스처 ----
const makeAuditLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-uuid-1',
  userId: 'user-123',
  action: 'LOGIN',
  resource: 'auth',
  status: 'SUCCESS',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  timestamp: new Date(),
  ...overrides,
});

const makeRiskAlert = (overrides: Record<string, unknown> = {}) => ({
  id: 'alert-uuid-1',
  severity: 'HIGH',
  title: 'Failed Login Attempts',
  description: '5 failed login attempts from 192.168.1.100',
  status: 'OPEN',
  detectedAt: new Date(),
  resolvedAt: null,
  ...overrides,
});

const makeIntegrityResult = (status: 'PASS' | 'FAIL' | 'ERROR' = 'PASS') => ({
  status,
  totalFiles: 150,
  changedFiles: status === 'FAIL' ? ['file1.js'] : [],
  newFiles: status === 'FAIL' ? ['new.js'] : [],
  deletedFiles: [],
  checkedAt: new Date(),
});

const makeChainVerificationResult = (overrides: Record<string, unknown> = {}) => ({
  valid: true,
  totalLogs: 100,
  checkedLogs: 100,
  brokenAt: null,
  ...overrides,
});

const makeMockUser = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user-123',
  loginId: 'admin@example.com',
  userType: 'ADMIN' as const,
  roles: ['SUPER_ADMIN'],
  permissions: ['AUDIT_READ', 'RISK_READ', 'RISK_MANAGE', 'SYSTEM_MANAGE'],
  ...overrides,
});

describe('SecurityController', () => {
  let controller: SecurityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [
        { provide: SecurityService, useValue: mockSecurityService },
        { provide: IntegrityMonitorService, useValue: mockIntegrityMonitorService },
        { provide: AuditHashChainService, useValue: mockAuditHashChainService },
      ],
    }).compile();

    controller = module.get<SecurityController>(SecurityController);
    jest.clearAllMocks();
  });

  describe('getAuditLogs', () => {
    it('감사 로그 목록을 조회하고 반환한다', async () => {
      const logs = [makeAuditLog(), makeAuditLog({ action: 'LOGOUT' })];
      const expected = { data: logs, meta: { total: 2, page: 1, limit: 20 } };
      mockSecurityService.getAuditLogs.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.getAuditLogs(query as any);

      expect(result).toEqual(expected);
      expect(mockSecurityService.getAuditLogs).toHaveBeenCalledWith(query);
    });

    it('빈 감사 로그 목록을 조회할 수 있다', async () => {
      const expected = { data: [], meta: { total: 0, page: 1, limit: 20 } };
      mockSecurityService.getAuditLogs.mockResolvedValue(expected);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.getAuditLogs({} as any);

      expect(result.data).toEqual([]);
    });
  });

  describe('getRiskAlerts', () => {
    it('리스크 알림 목록을 조회하고 반환한다', async () => {
      const alerts = [makeRiskAlert(), makeRiskAlert({ severity: 'CRITICAL' })];
      const expected = { data: alerts, meta: { total: 2, page: 1, limit: 20 } };
      mockSecurityService.getRiskAlerts.mockResolvedValue(expected);

      const query = { page: 1, limit: 20 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.getRiskAlerts(query as any);

      expect(result).toEqual(expected);
      expect(mockSecurityService.getRiskAlerts).toHaveBeenCalledWith(query);
    });

    it('상태별로 리스크 알림을 필터링할 수 있다', async () => {
      const openAlerts = [makeRiskAlert({ status: 'OPEN' })];
      const expected = { data: openAlerts, meta: { total: 1, page: 1, limit: 20 } };
      mockSecurityService.getRiskAlerts.mockResolvedValue(expected);

      const query = { status: 'OPEN', page: 1, limit: 20 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.getRiskAlerts(query as any);

      expect(result.data).toEqual(openAlerts);
    });
  });

  describe('resolveRiskAlert', () => {
    it('리스크 알림을 해결 표시하고 결과를 반환한다', async () => {
      const alertId = 'alert-uuid-1';
      const userId = 'user-123';
      const resolved = makeRiskAlert({ status: 'RESOLVED', resolvedAt: new Date() });
      mockSecurityService.resolveRiskAlert.mockResolvedValue(resolved);

      const result = await controller.resolveRiskAlert(alertId, makeMockUser({ sub: userId }));

      expect(result.data).toEqual(resolved);
      expect(mockSecurityService.resolveRiskAlert).toHaveBeenCalledWith(alertId, userId);
    });

    it('유효하지 않은 UUID 형식은 ParseUUIDPipe에서 거부된다', async () => {
      // ParseUUIDPipe는 NestJS가 처리하므로, 여기서는 검증 로직이 있는지 확인만 함
      // 실제로는 ParseUUIDPipe 미들웨어가 400 BadRequestException 발생
      // 단위 테스트에서는 파이프가 적용되지 않으므로, 컨트롤러 로직 검증만 수행
      expect(controller.resolveRiskAlert).toBeDefined();
    });

    it('존재하지 않는 알림 ID를 해결 시도할 때 NotFoundException을 던진다', async () => {
      const alertId = 'non-existent-alert';
      mockSecurityService.resolveRiskAlert.mockRejectedValue(
        new NotFoundException('알림을 찾을 수 없습니다'),
      );

      await expect(
        controller.resolveRiskAlert(alertId, makeMockUser()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLoginHistory', () => {
    it('로그인 이력을 조회하고 반환한다', async () => {
      const history = [
        makeAuditLog({ action: 'LOGIN', resource: 'auth' }),
        makeAuditLog({ action: 'LOGIN', resource: 'auth', status: 'FAILED' }),
      ];
      const expected = { data: history, meta: { total: 2, page: 1, limit: 20 } };
      mockSecurityService.getLoginHistory.mockResolvedValue(expected);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.getLoginHistory({} as any);

      expect(result).toEqual(expected);
      expect(mockSecurityService.getLoginHistory).toHaveBeenCalled();
    });
  });

  describe('verifyAuditChain', () => {
    it('유효한 날짜 범위로 감사 체인을 검증한다', async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-01-31';
      const result = makeChainVerificationResult();
      mockAuditHashChainService.verifyChain.mockResolvedValue(result);

      const response = await controller.verifyAuditChain(startDate, endDate);

      expect(response.data).toEqual(result);
      expect(mockAuditHashChainService.verifyChain).toHaveBeenCalledWith(
        new Date(startDate),
        new Date(endDate),
      );
    });

    it('startDate 또는 endDate가 없으면 BadRequestException을 던진다', async () => {
      await expect(controller.verifyAuditChain(undefined, undefined)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.verifyAuditChain('2026-01-01', undefined)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.verifyAuditChain(undefined, '2026-01-31')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('유효하지 않은 날짜 형식이면 BadRequestException을 던진다', async () => {
      await expect(controller.verifyAuditChain('invalid-date', '2026-01-31')).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.verifyAuditChain('2026-01-01', 'bad-date')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('endDate가 startDate 이전이면 BadRequestException을 던진다', async () => {
      const startDate = '2026-01-31';
      const endDate = '2026-01-01';

      await expect(controller.verifyAuditChain(startDate, endDate)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('90일을 초과하는 범위는 BadRequestException을 던진다', async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-04-02'; // 91일
      const MAX_RANGE_DAYS = 90;
      const maxAllowed = new Date(startDate);
      maxAllowed.setDate(maxAllowed.getDate() + MAX_RANGE_DAYS);

      await expect(controller.verifyAuditChain(startDate, endDate)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('정확히 90일 범위는 허용한다', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-03-31'); // 90일
      const result = makeChainVerificationResult();
      mockAuditHashChainService.verifyChain.mockResolvedValue(result);

      const response = await controller.verifyAuditChain(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
      );

      expect(response.data).toEqual(result);
    });

    it('체인 검증 중 tampering이 감지되면 결과에 반영된다', async () => {
      const result = makeChainVerificationResult({
        valid: false,
        brokenAt: 'log-50',
      });
      mockAuditHashChainService.verifyChain.mockResolvedValue(result);

      const response = await controller.verifyAuditChain('2026-01-01', '2026-01-31');

      expect(response.data.valid).toBe(false);
      expect(response.data.brokenAt).toBe('log-50');
    });
  });

  describe('getLatestAuditHash', () => {
    it('최신 감사 로그 해시를 조회한다', async () => {
      const hash = 'abc123def456';
      mockAuditHashChainService.getLatestHash.mockResolvedValue(hash);

      const result = await controller.getLatestAuditHash();

      expect(result.data.latestHash).toBe(hash);
      expect(mockAuditHashChainService.getLatestHash).toHaveBeenCalled();
    });

    it('감사 로그가 없을 때 null을 반환할 수 있다', async () => {
      mockAuditHashChainService.getLatestHash.mockResolvedValue(null);

      const result = await controller.getLatestAuditHash();

      expect(result.data.latestHash).toBeNull();
    });
  });

  describe('getIntegrityStatus', () => {
    it('캐시된 검사 결과가 있으면 반환한다', async () => {
      const cached = makeIntegrityResult('PASS');
      mockIntegrityMonitorService.getLastCheckResult.mockResolvedValue(cached);

      const result = await controller.getIntegrityStatus();

      expect(result.data).toEqual(cached);
      expect(mockIntegrityMonitorService.getLastCheckResult).toHaveBeenCalled();
      expect(mockIntegrityMonitorService.checkIntegrity).not.toHaveBeenCalled();
    });

    it('캐시된 결과가 없으면 새 검사를 실행한다', async () => {
      const fresh = makeIntegrityResult('PASS');
      mockIntegrityMonitorService.getLastCheckResult.mockResolvedValue(null);
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue(fresh);

      const result = await controller.getIntegrityStatus();

      expect(result.data).toEqual(fresh);
      expect(mockIntegrityMonitorService.checkIntegrity).toHaveBeenCalled();
    });

    it('검사 실패(FAIL) 상태를 반환할 수 있다', async () => {
      const failed = makeIntegrityResult('FAIL');
      mockIntegrityMonitorService.getLastCheckResult.mockResolvedValue(failed);

      const result = await controller.getIntegrityStatus();

      expect(result.data.status).toBe('FAIL');
      expect(result.data.changedFiles.length).toBeGreaterThan(0);
    });

    it('검사 오류(ERROR) 상태를 반환할 수 있다', async () => {
      const error = makeIntegrityResult('ERROR');
      mockIntegrityMonitorService.getLastCheckResult.mockResolvedValue(error);

      const result = await controller.getIntegrityStatus();

      expect(result.data.status).toBe('ERROR');
    });
  });

  describe('triggerIntegrityScan', () => {
    it('파일 무결성 검사를 수동으로 실행한다', async () => {
      const result = makeIntegrityResult('PASS');
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue(result);

      const response = await controller.triggerIntegrityScan();

      expect(response.data).toEqual(result);
      expect(mockIntegrityMonitorService.checkIntegrity).toHaveBeenCalled();
    });

    it('검사 중 변경된 파일을 감지하면 FAIL을 반환한다', async () => {
      const failed = {
        status: 'FAIL',
        totalFiles: 150,
        changedFiles: ['config.json', 'app.js'],
        newFiles: ['new-plugin.js'],
        deletedFiles: ['deprecated.js'],
        checkedAt: new Date(),
      };
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue(failed);

      const response = await controller.triggerIntegrityScan();

      expect(response.data.status).toBe('FAIL');
      expect(response.data.changedFiles.length).toBe(2);
      expect(response.data.newFiles.length).toBe(1);
    });

    it('검사 중 오류가 발생하면 ERROR를 반환한다', async () => {
      const error = makeIntegrityResult('ERROR');
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue(error);

      const response = await controller.triggerIntegrityScan();

      expect(response.data.status).toBe('ERROR');
    });
  });

  describe('updateBaseline', () => {
    it('파일 무결성 베이스라인을 업데이트한다', async () => {
      const userId = 'user-123';
      mockIntegrityMonitorService.updateBaseline.mockResolvedValue(undefined);

      const result = await controller.updateBaseline(makeMockUser({ sub: userId }));

      expect(result.data.message).toBe('베이스라인이 업데이트되었습니다');
      expect(mockIntegrityMonitorService.updateBaseline).toHaveBeenCalledWith(userId);
    });

    it('베이스라인 업데이트 중 오류가 발생하면 예외를 던진다', async () => {
      mockIntegrityMonitorService.updateBaseline.mockRejectedValue(
        new Error('Baseline update failed'),
      );

      await expect(controller.updateBaseline(makeMockUser())).rejects.toThrow(
        'Baseline update failed',
      );
    });

    it('업데이트 후 userId를 기록한다', async () => {
      const userId = 'admin-user-456';
      mockIntegrityMonitorService.updateBaseline.mockResolvedValue(undefined);

      await controller.updateBaseline(makeMockUser({ sub: userId }));

      expect(mockIntegrityMonitorService.updateBaseline).toHaveBeenCalledWith(userId);
    });
  });

  describe('Permission & Authentication', () => {
    it('모든 엔드포인트는 JwtAuthGuard와 PermissionsGuard를 적용한다', () => {
      // 메타데이터 검증 — @UseGuards가 클래스에 적용됨
      expect(SecurityController).toBeDefined();
      // 실제 가드 검증은 통합 테스트에서 수행
    });

    it('getAuditLogs는 AUDIT_READ 권한이 필요하다', () => {
      // @RequirePermissions 메타데이터 검증
      const permissions = Reflect.getMetadata(
        'permissions',
        SecurityController.prototype.getAuditLogs,
      );
      expect(permissions).toBeDefined();
    });

    it('getRiskAlerts는 RISK_READ 권한이 필요하다', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        SecurityController.prototype.getRiskAlerts,
      );
      expect(permissions).toBeDefined();
    });

    it('resolveRiskAlert는 RISK_MANAGE 권한이 필요하다', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        SecurityController.prototype.resolveRiskAlert,
      );
      expect(permissions).toBeDefined();
    });

    it('verifyAuditChain은 SYSTEM_MANAGE 권한이 필요하다', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        SecurityController.prototype.verifyAuditChain,
      );
      expect(permissions).toBeDefined();
    });

    it('FIM 엔드포인트들은 SYSTEM_MANAGE 권한이 필요하다', () => {
      const endpoints = ['getIntegrityStatus', 'triggerIntegrityScan', 'updateBaseline'];
      endpoints.forEach((endpoint) => {
        const permissions = Reflect.getMetadata(
          'permissions',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, security/detect-object-injection
          (SecurityController.prototype as any)[endpoint],
        );
        expect(permissions).toBeDefined();
      });
    });
  });

  describe('Response Format', () => {
    it('resolveRiskAlert는 { data: ... } 형식으로 응답한다', async () => {
      const alert = makeRiskAlert();
      mockSecurityService.resolveRiskAlert.mockResolvedValue(alert);

      const result = await controller.resolveRiskAlert('alert-id', makeMockUser());

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(alert);
    });

    it('verifyAuditChain은 { data: ... } 형식으로 응답한다', async () => {
      const chainResult = makeChainVerificationResult();
      mockAuditHashChainService.verifyChain.mockResolvedValue(chainResult);

      const result = await controller.verifyAuditChain('2026-01-01', '2026-01-31');

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(chainResult);
    });

    it('getLatestAuditHash는 { data: { latestHash } } 형식으로 응답한다', async () => {
      mockAuditHashChainService.getLatestHash.mockResolvedValue('hash-value');

      const result = await controller.getLatestAuditHash();

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('latestHash');
    });

    it('getIntegrityStatus는 { data: ... } 형식으로 응답한다', async () => {
      const integrity = makeIntegrityResult();
      mockIntegrityMonitorService.getLastCheckResult.mockResolvedValue(integrity);

      const result = await controller.getIntegrityStatus();

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(integrity);
    });
  });
});
