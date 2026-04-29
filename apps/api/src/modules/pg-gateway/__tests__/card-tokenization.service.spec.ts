// ============================================================
// CardTokenizationService 단위 테스트
// PCI DSS 3.4: PAN 토큰화 / 복호화 / 비활성화 / 유효성 검사
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CardTokenizationService } from '../services/card-tokenization.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { KMS_SERVICE } from '../../security/kms/kms.interface';

// ---- KMS Mock (Symbol DI) ----
const mockKms = {
  encrypt: jest.fn().mockResolvedValue(Buffer.from('encrypted-pan-data')),
  decrypt: jest.fn().mockResolvedValue(Buffer.from('4111111111111111')),
  generateDataKey: jest.fn(),
  rotateKey: jest.fn(),
};

// ---- Prisma Mock ----
const mockPrisma = {
  card_tokens: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ============================================================
describe('CardTokenizationService', () => {
  let service: CardTokenizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardTokenizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KMS_SERVICE, useValue: mockKms },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<CardTokenizationService>(CardTokenizationService);
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════
  // tokenize() 테스트
  // ══════════════════════════════════════════════

  describe('tokenize()', () => {
    const baseParams = {
      cardNumber: '4111111111111111',
      merchantId: 'merchant-uuid-1',
      cardCompany: '신한카드',
      cardType: '체크',
      cardBrand: 'VISA',
      createdBy: 'user-uuid-1',
    };

    it('신규 카드 토큰 생성 → 64자 hex 토큰 + DB 저장 + 감사 로그', async () => {
      mockPrisma.card_tokens.findFirst.mockResolvedValue(null);
      mockPrisma.card_tokens.create.mockResolvedValue({ id: 'ct-1' });

      const result = await service.tokenize(baseParams);

      // 토큰 형식 검증: 64자 hex
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.cardBin).toBe('411111');
      expect(result.lastFour).toBe('1111');
      expect(result.cardCompany).toBe('신한카드');
      expect(result.cardType).toBe('체크');
      expect(result.cardBrand).toBe('VISA');
      expect(result.isNewToken).toBe(true);

      // KMS 암호화 호출 확인 (PAN 평문 → 암호화)
      expect(mockKms.encrypt).toHaveBeenCalledWith(
        Buffer.from('4111111111111111', 'utf-8'),
        'card-token-encryption',
      );

      // DB에 암호화된 PAN 저장 (평문 아님)
      expect(mockPrisma.card_tokens.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          encrypted_pan: Buffer.from('encrypted-pan-data'),
          card_bin: '411111',
          last_four: '1111',
          card_company: '신한카드',
          merchant_id: 'merchant-uuid-1',
        }),
      });

      // 감사 로그: PAN 미포함
      expect(mockSecurity.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CARD_TOKEN_CREATED',
          resourceType: 'card_tokens',
          detail: expect.objectContaining({
            cardBin: '411111',
            lastFour: '1111',
          }),
        }),
      );
    });

    it('동일 카드 재토큰화 → 기존 토큰 재사용 (isNewToken=false)', async () => {
      const existingToken = {
        token: 'existing-token-64chars'.padEnd(64, '0'),
        card_bin: '411111',
        last_four: '1111',
        card_company: '신한카드',
        card_type: '체크',
        card_brand: 'VISA',
      };
      mockPrisma.card_tokens.findFirst.mockResolvedValue(existingToken);

      const result = await service.tokenize(baseParams);

      expect(result.token).toBe(existingToken.token);
      expect(result.isNewToken).toBe(false);

      // 새 토큰 생성 없음
      expect(mockKms.encrypt).not.toHaveBeenCalled();
      expect(mockPrisma.card_tokens.create).not.toHaveBeenCalled();
    });

    it('13자리 미만 카드번호 → BadRequestException', async () => {
      await expect(
        service.tokenize({ ...baseParams, cardNumber: '123456789012' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('20자리 초과 카드번호 → BadRequestException', async () => {
      await expect(
        service.tokenize({ ...baseParams, cardNumber: '12345678901234567890' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('숫자 외 문자 포함 카드번호 → BadRequestException', async () => {
      await expect(
        service.tokenize({ ...baseParams, cardNumber: '4111-abcd-1111-1111' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('빈 문자열 카드번호 → BadRequestException', async () => {
      await expect(
        service.tokenize({ ...baseParams, cardNumber: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ══════════════════════════════════════════════
  // detokenize() 테스트
  // ══════════════════════════════════════════════

  describe('detokenize()', () => {
    it('활성 토큰 복호화 → 원본 PAN 반환', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue({
        encrypted_pan: Buffer.from('encrypted-pan-data'),
        key_id: 'card-token-encryption',
        is_active: true,
        expires_at: null,
      });

      const pan = await service.detokenize('valid-token');

      expect(pan).toBe('4111111111111111');
      expect(mockKms.decrypt).toHaveBeenCalledWith(
        Buffer.from(Buffer.from('encrypted-pan-data')),
        'card-token-encryption',
      );
    });

    it('존재하지 않는 토큰 → NotFoundException', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue(null);

      await expect(service.detokenize('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('비활성 토큰 → BadRequestException', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue({
        encrypted_pan: Buffer.from('data'),
        key_id: 'key',
        is_active: false,
        expires_at: null,
      });

      await expect(service.detokenize('inactive-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('만료된 토큰 → BadRequestException', async () => {
      const pastDate = new Date(Date.now() - 86400000); // 1일 전
      mockPrisma.card_tokens.findUnique.mockResolvedValue({
        encrypted_pan: Buffer.from('data'),
        key_id: 'key',
        is_active: true,
        expires_at: pastDate,
      });

      await expect(service.detokenize('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ══════════════════════════════════════════════
  // deactivateToken() 테스트
  // ══════════════════════════════════════════════

  describe('deactivateToken()', () => {
    it('활성 토큰 비활성화 → is_active=false 업데이트 + 감사 로그', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue({
        id: 'ct-1',
        is_active: true,
        merchant_id: 'merchant-1',
      });
      mockPrisma.card_tokens.update.mockResolvedValue({ id: 'ct-1' });

      await service.deactivateToken({
        token: 'some-token',
        deactivatedBy: 'admin-1',
      });

      expect(mockPrisma.card_tokens.update).toHaveBeenCalledWith({
        where: { token: 'some-token' },
        data: { is_active: false, updated_by: 'admin-1' },
      });
      expect(mockSecurity.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CARD_TOKEN_DEACTIVATED',
        }),
      );
    });

    it('이미 비활성화된 토큰 → 멱등 처리 (update 호출 안됨)', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue({
        id: 'ct-1',
        is_active: false,
        merchant_id: 'merchant-1',
      });

      await service.deactivateToken({ token: 'already-inactive' });

      expect(mockPrisma.card_tokens.update).not.toHaveBeenCalled();
    });

    it('존재하지 않는 토큰 → NotFoundException', async () => {
      mockPrisma.card_tokens.findUnique.mockResolvedValue(null);

      await expect(
        service.deactivateToken({ token: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ══════════════════════════════════════════════
  // findExistingToken() 테스트
  // ══════════════════════════════════════════════

  describe('findExistingToken()', () => {
    it('기존 활성 토큰 존재 → 토큰 정보 반환', async () => {
      const existing = {
        token: 'tok-123',
        card_bin: '411111',
        last_four: '1111',
        card_company: '신한카드',
        card_type: '체크',
        card_brand: 'VISA',
      };
      mockPrisma.card_tokens.findFirst.mockResolvedValue(existing);

      const result = await service.findExistingToken('merchant-1', '411111', '1111');

      expect(result).toEqual(existing);
      expect(mockPrisma.card_tokens.findFirst).toHaveBeenCalledWith({
        where: {
          merchant_id: 'merchant-1',
          card_bin: '411111',
          last_four: '1111',
          is_active: true,
        },
        select: {
          token: true,
          card_bin: true,
          last_four: true,
          card_company: true,
          card_type: true,
          card_brand: true,
        },
      });
    });

    it('기존 토큰 없음 → null 반환', async () => {
      mockPrisma.card_tokens.findFirst.mockResolvedValue(null);

      const result = await service.findExistingToken('merchant-1', '999999', '0000');

      expect(result).toBeNull();
    });
  });
});
