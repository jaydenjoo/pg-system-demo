// ============================================================
// API 키 서비스 단위 테스트
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as bcrypt from 'bcryptjs';
import { ApiKeyService } from '../services/api-key.service';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('bcryptjs');

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// ---- Mock Cache ----
const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ---- Prisma Mock ----
const mockPrisma = {
  merchants: {
    findFirst: jest.fn(),
  },
  pg_api_keys: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

// ---- 픽스처 팩토리 ----
const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
  id: 'merchant-uuid-1',
  status: 'ACTIVE',
  ...overrides,
});

const makeApiKey = (overrides: Record<string, unknown> = {}) => ({
  id: 'api-key-uuid-1',
  merchant_id: 'merchant-uuid-1',
  client_key: 'ck_live_abc123',
  secret_key_hash: '$2b$12$hashedSecret',
  secret_key_prefix: 'sk_live_12345678',
  is_active: true,
  allowed_ips: [] as string[],
  webhook_url: null,
  created_at: new Date('2024-01-01'),
  ...overrides,
});

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // createApiKey
  // ---------------------------------------------------------------
  describe('createApiKey', () => {
    it('활성 가맹점에 대해 API 키를 발급하고 clientKey/secretKey를 반환한다', async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(makeMerchant());
      mockBcrypt.hash.mockResolvedValue('$2b$12$hashedSecret' as never);
      mockPrisma.pg_api_keys.create.mockResolvedValue({});

      const result = await service.createApiKey({
        merchantId: 'merchant-uuid-1',
      });

      expect(result.clientKey).toMatch(/^ck_live_/);
      expect(result.secretKey).toMatch(/^sk_live_/);
      expect(mockPrisma.pg_api_keys.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchant_id: 'merchant-uuid-1',
            secret_key_prefix: result.secretKey.substring(0, 16),
          }),
        }),
      );
    });

    it('가맹점이 존재하지 않으면 NotFoundException을 던진다', async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null);

      await expect(
        service.createApiKey({ merchantId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('비활성 가맹점(SUSPENDED)이면 NotFoundException을 던진다', async () => {
      mockPrisma.merchants.findFirst.mockResolvedValue(null); // ACTIVE 조건 불충족

      await expect(
        service.createApiKey({ merchantId: 'suspended-merchant' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // validateSecretKey
  // ---------------------------------------------------------------
  describe('validateSecretKey', () => {
    it('유효한 secretKey이면 { id, merchantId, clientKey }를 반환한다', async () => {
      const secretKey = 'sk_live_12345678abcdefghijklmnop1234567890123456789012345678';
      mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.validateSecretKey(secretKey);

      expect(result).toEqual({
        id: 'api-key-uuid-1',
        merchantId: 'merchant-uuid-1',
        clientKey: 'ck_live_abc123',
      });
    });

    it('prefix가 일치하는 키가 없으면 null을 반환한다', async () => {
      mockPrisma.pg_api_keys.findMany.mockResolvedValue([]);

      const result = await service.validateSecretKey('sk_live_unknown0000000000000000000000000000000000000000000000000');

      expect(result).toBeNull();
    });

    it('prefix는 맞지만 bcrypt 해시가 일치하지 않으면 null을 반환한다', async () => {
      mockPrisma.pg_api_keys.findMany.mockResolvedValue([makeApiKey()]);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await service.validateSecretKey('sk_live_12345678wrongSecretXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

      expect(result).toBeNull();
    });

    it('16자 미만의 secretKey이면 DB 조회 없이 null을 반환한다', async () => {
      const result = await service.validateSecretKey('short');

      expect(result).toBeNull();
      expect(mockPrisma.pg_api_keys.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // revokeApiKey
  // ---------------------------------------------------------------
  describe('revokeApiKey', () => {
    it('API 키를 비활성화(is_active=false)한다', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
      mockPrisma.pg_api_keys.update.mockResolvedValue({});

      await service.revokeApiKey('api-key-uuid-1', 'merchant-uuid-1');

      expect(mockPrisma.pg_api_keys.update).toHaveBeenCalledWith({
        where: { id: 'api-key-uuid-1' },
        data: { is_active: false },
      });
    });

    it('존재하지 않는 키를 폐기하면 NotFoundException을 던진다', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeApiKey('non-existent', 'merchant-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------
  // listApiKeys
  // ---------------------------------------------------------------
  describe('listApiKeys', () => {
    it('secretKey 없이 API 키 목록을 반환한다', async () => {
      mockPrisma.pg_api_keys.findMany.mockResolvedValue([
        makeApiKey(),
        makeApiKey({ id: 'api-key-uuid-2', client_key: 'ck_live_def456', is_active: false }),
      ]);

      const result = await service.listApiKeys('merchant-uuid-1');

      expect(result).toHaveLength(2);
      // secretKey 관련 필드가 절대 포함되지 않음
      result.forEach((item) => {
        expect(item).not.toHaveProperty('secretKey');
        expect(item).not.toHaveProperty('secret_key_hash');
        expect(item).not.toHaveProperty('secret_key_prefix');
        expect(item).toHaveProperty('clientKey');
        expect(item).toHaveProperty('isActive');
        expect(item).toHaveProperty('allowedIps');
      });
    });
  });

  // ---------------------------------------------------------------
  // updateAllowedIps
  // ---------------------------------------------------------------
  describe('updateAllowedIps', () => {
    it('API 키의 IP 화이트리스트를 업데이트한다', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue(makeApiKey());
      mockPrisma.pg_api_keys.update.mockResolvedValue({});

      await service.updateAllowedIps('api-key-uuid-1', 'merchant-uuid-1', ['192.168.1.1', '10.0.0.1']);

      expect(mockPrisma.pg_api_keys.update).toHaveBeenCalledWith({
        where: { id: 'api-key-uuid-1' },
        data: { allowed_ips: ['192.168.1.1', '10.0.0.1'] },
      });
    });

    it('존재하지 않는 키를 업데이트하면 NotFoundException을 던진다', async () => {
      mockPrisma.pg_api_keys.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAllowedIps('non-existent', 'merchant-uuid-1', []),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
