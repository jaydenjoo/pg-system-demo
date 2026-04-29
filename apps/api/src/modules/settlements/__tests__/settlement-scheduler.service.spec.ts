// ============================================================
// SettlementSchedulerService 단위 테스트
// calculatePeriod() 기간 계산 + handleDailySettlement() 배치 흐름
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SettlementSchedulerService } from '../settlement-scheduler.service';
import { SettlementAutoExecutionService } from '../settlement-auto-execution.service';
import { SETTLEMENT_QUEUE } from '../settlement.processor';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { SETTLEMENT_CYCLES, SETTLEMENT_STATUS } from '@pg-system/shared';

// ---- Prisma Mock ----
const mockPrisma = {
  merchants: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  settlements: {
    count: jest.fn(),
    create: jest.fn(),
  },
  agent_settlements: {
    create: jest.fn(),
  },
  transactions: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---- SecurityService Mock ----
const mockSecurity = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};

// ---- SettlementAutoExecutionService Mock ----
const mockAutoExecution = {
  autoConfirmSettlements: jest.fn().mockResolvedValue({ processed: 0, failed: 0, errors: [] }),
  autoRemitSettlements: jest.fn().mockResolvedValue({ processed: 0, failed: 0, errors: [] }),
  autoCompleteSettlements: jest.fn().mockResolvedValue({ processed: 0, failed: 0, errors: [] }),
};

// ---- BullMQ Queue Mock ----
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
};

// ============================================================
describe('SettlementSchedulerService', () => {
  let service: SettlementSchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
        { provide: SettlementAutoExecutionService, useValue: mockAutoExecution },
        { provide: getQueueToken(SETTLEMENT_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SettlementSchedulerService>(SettlementSchedulerService);
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════
  // calculatePeriod() 단위 테스트
  // ══════════════════════════════════════════════

  describe('calculatePeriod()', () => {
    const base = new Date('2024-01-10T00:00:00.000Z');

    // TC-S1: D+1 → 어제(base) 하루
    it('TC-S1: D+1 → base 날짜 당일 전체 (00:00 ~ 23:59:59.999)', () => {
      const { from, to } = service.calculatePeriod(SETTLEMENT_CYCLES.D1, base);

      expect(from.toISOString().slice(0, 10)).toBe('2024-01-10');
      expect(to.getUTCHours()).toBe(23);
      expect(to.getUTCMinutes()).toBe(59);
      expect(to.getUTCSeconds()).toBe(59);
    });

    // TC-S2: D+2 → base - 1일
    it('TC-S2: D+2 → base 하루 전 날짜 전체', () => {
      const { from, to } = service.calculatePeriod(SETTLEMENT_CYCLES.D2, base);

      expect(from.toISOString().slice(0, 10)).toBe('2024-01-09');
      expect(to.toISOString().slice(0, 10)).toBe('2024-01-09');
    });

    // TC-S3: D+3 → base - 2일
    it('TC-S3: D+3 → base 2일 전 날짜 전체', () => {
      const { from } = service.calculatePeriod(SETTLEMENT_CYCLES.D3, base);
      expect(from.toISOString().slice(0, 10)).toBe('2024-01-08');
    });

    // TC-S4: WEEKLY → 지난 7일
    it('TC-S4: WEEKLY → base 포함 7일 범위', () => {
      const { from, to } = service.calculatePeriod(SETTLEMENT_CYCLES.WEEKLY, base);

      expect(from.toISOString().slice(0, 10)).toBe('2024-01-04');
      expect(to.toISOString().slice(0, 10)).toBe('2024-01-10');
    });

    // TC-S5: MONTHLY → 지난 달 전체
    it('TC-S5: MONTHLY → 지난달 1일 ~ 말일', () => {
      const { from, to } = service.calculatePeriod(SETTLEMENT_CYCLES.MONTHLY, base);

      expect(from.getUTCFullYear()).toBe(2023);
      expect(from.getUTCMonth()).toBe(11); // 12월 (0-indexed)
      expect(from.getUTCDate()).toBe(1);
      expect(to.getUTCFullYear()).toBe(2023);
      expect(to.getUTCMonth()).toBe(11);
      expect(to.getUTCDate()).toBe(31);
    });
  });

  // ══════════════════════════════════════════════
  // shouldRunForCycle() 실행 조건 테스트
  // ══════════════════════════════════════════════

  describe('shouldRunForCycle()', () => {
    // TC-S9: D+1, D+2, D+3 → 항상 true
    it('TC-S9: D+1/D+2/D+3 → 요일 무관 항상 true', () => {
      const anyDate = new Date('2024-01-10T00:00:00.000Z'); // 수요일
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.D1, anyDate)).toBe(true);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.D2, anyDate)).toBe(true);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.D3, anyDate)).toBe(true);
    });

    // TC-S10: WEEKLY — 월요일만 true
    it('TC-S10: WEEKLY → 월요일(UTCDay=1)만 true, 다른 요일은 false', () => {
      const monday = new Date('2024-01-08T00:00:00.000Z');    // 월요일
      const tuesday = new Date('2024-01-09T00:00:00.000Z');   // 화요일
      const sunday = new Date('2024-01-14T00:00:00.000Z');    // 일요일

      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.WEEKLY, monday)).toBe(true);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.WEEKLY, tuesday)).toBe(false);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.WEEKLY, sunday)).toBe(false);
    });

    // TC-S11: MONTHLY — 1일만 true
    it('TC-S11: MONTHLY → 매월 1일(UTCDate=1)만 true, 다른 날은 false', () => {
      const first = new Date('2024-02-01T00:00:00.000Z');     // 2월 1일
      const second = new Date('2024-02-02T00:00:00.000Z');    // 2월 2일
      const lastDay = new Date('2024-01-31T00:00:00.000Z');   // 1월 31일

      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.MONTHLY, first)).toBe(true);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.MONTHLY, second)).toBe(false);
      expect(service.shouldRunForCycle(SETTLEMENT_CYCLES.MONTHLY, lastDay)).toBe(false);
    });
  });

  // ══════════════════════════════════════════════
  // handleDailySettlement() 배치 흐름 테스트
  // ══════════════════════════════════════════════

  // TC-S6: 활성 가맹점 없음 → 조기 종료
  it('TC-S6: 활성 가맹점 없음 → 조기 종료 (auditLog 호출 안됨)', async () => {
    mockPrisma.merchants.findMany.mockResolvedValue([]);

    await service.handleDailySettlement();

    expect(mockPrisma.settlements.count).not.toHaveBeenCalled();
    expect(mockSecurity.writeAuditLog).not.toHaveBeenCalled();
  });

  // TC-S7: 정상 배치 실행 → settlements 생성 + auditLog 호출
  it('TC-S7: 정상 배치 → settlements 생성 + auditLog 기록', async () => {
    mockPrisma.merchants.findMany.mockResolvedValue([
      { id: 'merchant-1', merchant_name: '테스트 가맹점', settlement_cycle: 'D+1' },
    ]);
    mockPrisma.settlements.count.mockResolvedValue(0);
    mockPrisma.transactions.findMany.mockResolvedValue([
      { id: 'txn-1', tran_type: 'PAYMENT', amount: BigInt(10000), fee_amount: BigInt(350), net_amount: BigInt(9650) },
    ]);
    mockPrisma.merchants.findFirst.mockResolvedValue({ agent_id: 'agent-1' });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
    mockPrisma.settlements.create.mockResolvedValue({ id: 'stl-1' });
    mockPrisma.agent_settlements.create.mockResolvedValue({ id: 'astl-1' });

    await service.handleDailySettlement();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.settlements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchant_id: 'merchant-1',
          status: SETTLEMENT_STATUS.CALCULATED,
          created_by: 'SYSTEM_BATCH',
        }),
      }),
    );
    expect(mockSecurity.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SETTLEMENT_BATCH',
        resourceType: 'settlements',
      }),
    );
  });

  // TC-S8: 가맹점 1건 실패 → 나머지 계속 처리 (격리)
  it('TC-S8: 가맹점 1건 DB 오류 → 다른 가맹점은 처리 계속', async () => {
    mockPrisma.merchants.findMany.mockResolvedValue([
      { id: 'merchant-fail', merchant_name: '실패 가맹점', settlement_cycle: 'D+1' },
      { id: 'merchant-ok', merchant_name: '성공 가맹점', settlement_cycle: 'D+1' },
    ]);
    // merchant-fail: settlements.count 호출 시 예외
    mockPrisma.settlements.count
      .mockRejectedValueOnce(new Error('DB 연결 오류'))
      .mockResolvedValueOnce(0);

    mockPrisma.transactions.findMany.mockResolvedValue([
      { id: 'txn-1', tran_type: 'PAYMENT', amount: BigInt(5000), fee_amount: BigInt(175), net_amount: BigInt(4825) },
    ]);
    mockPrisma.merchants.findFirst.mockResolvedValue({ agent_id: 'agent-1' });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
    mockPrisma.settlements.create.mockResolvedValue({ id: 'stl-1' });
    mockPrisma.agent_settlements.create.mockResolvedValue({ id: 'astl-1' });

    await service.handleDailySettlement();

    // 전체 배치는 완료되어야 함 (오류가 전파되지 않음)
    expect(mockSecurity.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ failed: 1, succeeded: 1 }),
      }),
    );
  });
});
