// ============================================================
// Security — 키 로테이션 서비스 단위 테스트 (PCI DSS 3.6.1)
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { KeyRotationService } from '../key-rotation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../security.service';
import { KMS_SERVICE } from '../kms/kms.interface';

// ---- Prisma Mock ----
const mockPrisma = {
  encryption_key_metadata: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

// ---- SecurityService Mock ----
const mockSecurityService = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- KmsService Mock ----
const mockKmsService = {
  rotateKey: jest.fn(),
};

// ---- 픽스처 팩토리 ----
const makeKeyMeta = (overrides: Record<string, unknown> = {}) => ({
  id: 'key-meta-uuid-1',
  key_alias: 'payment-master-key',
  status: 'ACTIVE',
  rotation_period_days: 90,
  last_rotated_at: new Date('2026-01-01'),
  next_rotation_at: new Date('2026-03-31'),
  ...overrides,
});

describe('KeyRotationService', () => {
  let service: KeyRotationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyRotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurityService },
        { provide: KMS_SERVICE, useValue: mockKmsService },
      ],
    }).compile();

    service = module.get<KeyRotationService>(KeyRotationService);
    jest.clearAllMocks();
    mockSecurityService.writeAuditLog.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------
  // rotateKey
  // ---------------------------------------------------------------
  describe('rotateKey', () => {
    it('ACTIVE 키를 성공적으로 로테이션하고 KeyRotationResult를 반환한다', async () => {
      const keyMeta = makeKeyMeta();
      mockPrisma.encryption_key_metadata.findUnique.mockResolvedValue(keyMeta);
      mockPrisma.encryption_key_metadata.update.mockResolvedValue({});
      mockKmsService.rotateKey.mockResolvedValue('new-key-uuid-1');

      const result = await service.rotateKey('payment-master-key');

      expect(result.keyAlias).toBe('payment-master-key');
      expect(result.oldKeyId).toBe('key-meta-uuid-1');
      expect(result.newKeyId).toBe('new-key-uuid-1');
      expect(result.rotatedAt).toBeInstanceOf(Date);

      // ROTATING 잠금 → ACTIVE 복구 순서 검증
      expect(mockPrisma.encryption_key_metadata.update).toHaveBeenNthCalledWith(1, {
        where: { key_alias: 'payment-master-key' },
        data: { status: 'ROTATING' },
      });
      expect(mockPrisma.encryption_key_metadata.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { key_alias: 'payment-master-key' },
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('키를 찾을 수 없으면 Error를 던지고 DB 업데이트를 하지 않는다', async () => {
      mockPrisma.encryption_key_metadata.findUnique.mockResolvedValue(null);

      await expect(service.rotateKey('non-existent-key')).rejects.toThrow(
        '활성 키를 찾을 수 없습니다: non-existent-key',
      );
      expect(mockPrisma.encryption_key_metadata.update).not.toHaveBeenCalled();
    });

    it('키 상태가 ACTIVE가 아니면(RETIRED) Error를 던진다', async () => {
      mockPrisma.encryption_key_metadata.findUnique.mockResolvedValue(
        makeKeyMeta({ status: 'RETIRED' }),
      );

      await expect(service.rotateKey('payment-master-key')).rejects.toThrow(
        '활성 키를 찾을 수 없습니다: payment-master-key',
      );
    });

    it('KMS 오류 발생 시 status를 ACTIVE로 복구하고 에러를 재던진다', async () => {
      mockPrisma.encryption_key_metadata.findUnique.mockResolvedValue(makeKeyMeta());
      mockPrisma.encryption_key_metadata.update.mockResolvedValue({});
      mockKmsService.rotateKey.mockRejectedValue(new Error('KMS connection failed'));

      await expect(service.rotateKey('payment-master-key')).rejects.toThrow(
        'KMS connection failed',
      );

      // 실패 후 ACTIVE 복구 호출 검증
      expect(mockPrisma.encryption_key_metadata.update).toHaveBeenCalledWith({
        where: { key_alias: 'payment-master-key' },
        data: { status: 'ACTIVE' },
      });
    });
  });

  // ---------------------------------------------------------------
  // findKeysNeedingRotation
  // ---------------------------------------------------------------
  describe('findKeysNeedingRotation', () => {
    it('next_rotation_at이 지난 ACTIVE 키 별칭 목록을 반환한다', async () => {
      mockPrisma.encryption_key_metadata.findMany.mockResolvedValue([
        { key_alias: 'key-alias-1' },
        { key_alias: 'key-alias-2' },
      ]);

      const result = await service.findKeysNeedingRotation();

      expect(result).toEqual(['key-alias-1', 'key-alias-2']);
      expect(mockPrisma.encryption_key_metadata.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            next_rotation_at: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('로테이션 기한이 지난 키가 없으면 빈 배열을 반환한다', async () => {
      mockPrisma.encryption_key_metadata.findMany.mockResolvedValue([]);

      const result = await service.findKeysNeedingRotation();

      expect(result).toEqual([]);
    });
  });
});
