// ============================================================
// SettlementAutoExecutionService 단위 테스트
// CALCULATED→CONFIRMED→REMITTED→COMPLETED 자동 전환 배치
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import {
  SettlementAutoExecutionService,
} from '../settlement-auto-execution.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { BankingApiService } from '../banking-api.service';
import { SETTLEMENT_STATUS } from '@pg-system/shared';

// ---- Prisma Mock ----
const mockPrisma = {
  settlements: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- BankingApiService Mock ----
const mockBankingApi = {
  transfer: jest.fn(),
};

// ============================================================
describe('SettlementAutoExecutionService', () => {
  let service: SettlementAutoExecutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementAutoExecutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: BankingApiService, useValue: mockBankingApi },
      ],
    }).compile();

    service = module.get<SettlementAutoExecutionService>(
      SettlementAutoExecutionService,
    );
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════
  // autoConfirmSettlements() 테스트
  // ══════════════════════════════════════════════

  describe('autoConfirmSettlements()', () => {
    it('24시간 경과 건 → CONFIRMED 전환 + 감사 로그', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        { id: 'stl-1', merchant_id: 'm-1', total_net: BigInt(10000) },
        { id: 'stl-2', merchant_id: 'm-2', total_net: BigInt(20000) },
      ]);
      mockPrisma.settlements.update.mockResolvedValue({});

      const result = await service.autoConfirmSettlements();

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // DB 업데이트 확인
      expect(mockPrisma.settlements.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.settlements.update).toHaveBeenCalledWith({
        where: { id: 'stl-1' },
        data: {
          status: SETTLEMENT_STATUS.CONFIRMED,
          updated_by: 'SYSTEM_AUTO',
        },
      });

      // 24시간 cutoff 조건 확인
      expect(mockPrisma.settlements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SETTLEMENT_STATUS.CALCULATED,
            created_at: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('대상 건 없음 → processed=0', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([]);

      const result = await service.autoConfirmSettlements();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockPrisma.settlements.update).not.toHaveBeenCalled();
    });

    it('1건 DB 오류 → 해당 건 실패, 나머지 계속 처리', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        { id: 'stl-fail', merchant_id: 'm-1', total_net: BigInt(5000) },
        { id: 'stl-ok', merchant_id: 'm-2', total_net: BigInt(8000) },
      ]);
      mockPrisma.settlements.update
        .mockRejectedValueOnce(new Error('DB 오류'))
        .mockResolvedValueOnce({});

      const result = await service.autoConfirmSettlements();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('stl-fail');
    });

    it('maxCount 제한 동작 확인', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([]);

      await service.autoConfirmSettlements(5);

      expect(mockPrisma.settlements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  // ══════════════════════════════════════════════
  // autoRemitSettlements() 테스트
  // ══════════════════════════════════════════════

  describe('autoRemitSettlements()', () => {
    const makeSettlement = (
      id: string,
      merchantId: string,
      bankName: string | null,
      bankAccount: string | null,
      bankHolder: string | null = null,
    ) => ({
      id,
      merchant_id: merchantId,
      total_net: BigInt(15000),
      merchants: { bank_name: bankName, bank_account: bankAccount, bank_holder: bankHolder },
    });

    it('송금 성공 → REMITTED 전환 + remitted_at 설정', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        makeSettlement('stl-1', 'm-1', '국민은행', '123-456-789', '홍길동'),
      ]);
      mockBankingApi.transfer.mockResolvedValue({
        success: true,
        referenceId: 'BANK-123',
      });
      mockPrisma.settlements.update.mockResolvedValue({});

      const result = await service.autoRemitSettlements();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      expect(mockBankingApi.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          bankCode: '국민은행',
          accountNumber: '123-456-789',
          amount: BigInt(15000),
          reference: 'stl-1',
          accountHolder: '홍길동',
        }),
      );

      expect(mockPrisma.settlements.update).toHaveBeenCalledWith({
        where: { id: 'stl-1' },
        data: expect.objectContaining({
          status: SETTLEMENT_STATUS.REMITTED,
          remitted_at: expect.any(Date),
          updated_by: 'SYSTEM_AUTO',
        }),
      });
    });

    it('가맹점 은행 정보 미등록 → 실패 (송금 시도 안 함)', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        makeSettlement('stl-no-bank', 'm-2', null, null),
      ]);

      const result = await service.autoRemitSettlements();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('은행 정보 미등록');
      expect(mockBankingApi.transfer).not.toHaveBeenCalled();
    });

    it('송금 API 실패 → 해당 건 스킵, DB 업데이트 안 함', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        makeSettlement('stl-1', 'm-1', '국민은행', '123-456'),
      ]);
      mockBankingApi.transfer.mockResolvedValue({
        success: false,
        referenceId: '',
        errorMessage: '잔액 부족',
      });

      const result = await service.autoRemitSettlements();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('송금 실패');
      expect(mockPrisma.settlements.update).not.toHaveBeenCalled();
    });

    it('혼합 상황: 성공 1건 + 은행 정보 미등록 1건 + 송금 실패 1건', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        makeSettlement('stl-ok', 'm-1', '우리은행', '111-222', '김성공'),
        makeSettlement('stl-no-bank', 'm-2', null, null),
        makeSettlement('stl-fail', 'm-3', '신한은행', '333-444', '이실패'),
      ]);
      mockBankingApi.transfer
        .mockResolvedValueOnce({ success: true, referenceId: 'BANK-OK' })
        .mockResolvedValueOnce({ success: false, referenceId: '', errorMessage: 'API 오류' });
      mockPrisma.settlements.update.mockResolvedValue({});

      const result = await service.autoRemitSettlements();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  // ══════════════════════════════════════════════
  // autoCompleteSettlements() 테스트
  // ══════════════════════════════════════════════

  describe('autoCompleteSettlements()', () => {
    it('송금 후 24시간 경과 → COMPLETED 전환', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        { id: 'stl-1', merchant_id: 'm-1', total_net: BigInt(30000) },
      ]);
      mockPrisma.settlements.update.mockResolvedValue({});

      const result = await service.autoCompleteSettlements();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);

      expect(mockPrisma.settlements.update).toHaveBeenCalledWith({
        where: { id: 'stl-1' },
        data: {
          status: SETTLEMENT_STATUS.COMPLETED,
          updated_by: 'SYSTEM_AUTO',
        },
      });

      // remitted_at < cutoff 조건 확인
      expect(mockPrisma.settlements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SETTLEMENT_STATUS.REMITTED,
            remitted_at: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('대상 건 없음 → processed=0', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([]);

      const result = await service.autoCompleteSettlements();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('1건 DB 오류 → 해당 건 실패, 나머지 계속', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([
        { id: 'stl-fail', merchant_id: 'm-1', total_net: BigInt(5000) },
        { id: 'stl-ok', merchant_id: 'm-2', total_net: BigInt(7000) },
      ]);
      mockPrisma.settlements.update
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockResolvedValueOnce({});

      const result = await service.autoCompleteSettlements();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('stl-fail');
    });

    it('maxCount 제한 동작 확인', async () => {
      mockPrisma.settlements.findMany.mockResolvedValue([]);

      await service.autoCompleteSettlements(10);

      expect(mockPrisma.settlements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });
});
