// ============================================================
// FdsRuleEngineService 단위 테스트
// R1~R5 룰 평가 + evaluate() 반환값 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { FdsRuleEngineService } from '../services/fds-rule-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import { FDS_RULES } from '@pg-system/shared';

// ---- Prisma Mock ----
const mockPrisma = {
  pg_payment_orders: {
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  transactions: {
    count: jest.fn(),
  },
};

// ---- SecurityService Mock ----
const mockSecurity = {
  createRiskAlert: jest.fn().mockResolvedValue(undefined),
};

// ---- 기본 파라미터 ----
const BASE_PARAMS = {
  merchantId: 'merchant-uuid-1',
  amount: 10000,
  cardNumber: '4111111111111111',
  paymentKey: 'pk-test-1',
};

// ============================================================
describe('FdsRuleEngineService', () => {
  let service: FdsRuleEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FdsRuleEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityService, useValue: mockSecurity },
      ],
    }).compile();

    service = module.get<FdsRuleEngineService>(FdsRuleEngineService);
    jest.clearAllMocks();

    // 기본값: 모든 DB 쿼리 정상 통과
    mockPrisma.pg_payment_orders.aggregate.mockResolvedValue({ _sum: { amount: BigInt(0) } });
    mockPrisma.pg_payment_orders.count.mockResolvedValue(0);
    mockPrisma.transactions.count.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── TC-F1: 정상 거래 → blocked:false, violations:[] ──
  it('TC-F1: 모든 룰 통과 → blocked=false, violations=[]', async () => {
    const result = await service.evaluate(BASE_PARAMS);

    expect(result.blocked).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(mockSecurity.createRiskAlert).not.toHaveBeenCalled();
  });

  // ── TC-F2: R1 — 단건 500만 원 초과 → BLOCK ──
  it('TC-F2: R1 단건 500만 원 초과 → blocked=true, ruleId=R1', async () => {
    const result = await service.evaluate({
      ...BASE_PARAMS,
      amount: FDS_RULES.SINGLE_TXN_LIMIT + 1,
    });

    expect(result.blocked).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe('R1');
    expect(result.violations[0].action).toBe('BLOCK');
    expect(mockSecurity.createRiskAlert).toHaveBeenCalledTimes(1);
  });

  // ── TC-F3: R2 — 시간당 누적 1,000만 원 초과 → BLOCK ──
  it('TC-F3: R2 시간당 누적 한도 초과 → blocked=true, ruleId=R2', async () => {
    // 이미 9,999,999원 누적 + 현재 100원 = 10,000,099원 > 10,000,000원
    mockPrisma.pg_payment_orders.aggregate.mockResolvedValue({
      _sum: { amount: BigInt(FDS_RULES.HOURLY_MERCHANT_LIMIT - 1) },
    });

    const result = await service.evaluate({ ...BASE_PARAMS, amount: 2 });

    expect(result.blocked).toBe(true);
    expect(result.violations[0].ruleId).toBe('R2');
  });

  // ── TC-F4: R3 — 동일 카드 5회 초과 → BLOCK ──
  it('TC-F4: R3 동일 카드 5회 초과 → blocked=true, ruleId=R3', async () => {
    mockPrisma.transactions.count.mockResolvedValue(FDS_RULES.HOURLY_CARD_COUNT_LIMIT + 1);

    const result = await service.evaluate(BASE_PARAMS);

    expect(result.blocked).toBe(true);
    expect(result.violations[0].ruleId).toBe('R3');
    // last4 기반으로 query 됐는지 확인
    expect(mockPrisma.transactions.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payment_detail: expect.objectContaining({
            string_ends_with: '1111', // cardNumber '4111111111111111'의 last4
          }),
        }),
      }),
    );
  });

  // ── TC-F5: R4 — 심야 고액 → WARN (blocked=false) ──
  it('TC-F5: R4 KST 심야 100만 원 초과 → blocked=false, warnings 포함', async () => {
    // KST 23:30 = UTC 14:30 (KST 기준 심야)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-10T14:30:00.000Z'));

    const result = await service.evaluate({
      ...BASE_PARAMS,
      amount: FDS_RULES.NIGHT_HIGH_AMOUNT + 1,
    });

    expect(result.blocked).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.violations[0].ruleId).toBe('R4');
    expect(result.violations[0].action).toBe('WARN');
  });

  // ── TC-F6: R5 — 30분 내 ABORTED 3회 이상 → BLOCK ──
  it('TC-F6: R5 연속 거절 3회 이상 → blocked=true, ruleId=R5', async () => {
    mockPrisma.pg_payment_orders.count.mockResolvedValue(FDS_RULES.CONSECUTIVE_FAIL_LIMIT);

    const result = await service.evaluate(BASE_PARAMS);

    expect(result.blocked).toBe(true);
    expect(result.violations[0].ruleId).toBe('R5');
  });

  // ── TC-F7: R1 BLOCK 시 R2/R3/R5 DB 쿼리 생략 ──
  it('TC-F7: R1 BLOCK → R2 DB aggregate 호출 안됨 (조기 반환)', async () => {
    await service.evaluate({
      ...BASE_PARAMS,
      amount: FDS_RULES.SINGLE_TXN_LIMIT + 1,
    });

    // R1에서 BLOCK → R2 aggregate 호출 없음
    expect(mockPrisma.pg_payment_orders.aggregate).not.toHaveBeenCalled();
  });

  // ── TC-F8: R2 BLOCK 시 조기 반환 → R2만 violations에 포함 ──
  it('TC-F8: R2 BLOCK → 조기 반환하여 R3/R4/R5 미평가, violations에 R2만 존재', async () => {
    mockPrisma.pg_payment_orders.aggregate.mockResolvedValue({
      _sum: { amount: BigInt(FDS_RULES.HOURLY_MERCHANT_LIMIT) },
    });
    mockPrisma.pg_payment_orders.count.mockResolvedValue(FDS_RULES.CONSECUTIVE_FAIL_LIMIT);

    const result = await service.evaluate({ ...BASE_PARAMS, amount: 1 });

    expect(result.blocked).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe('R2');
    // R3 DB 쿼리는 호출되지 않아야 함 (조기 반환)
    expect(mockPrisma.transactions.count).not.toHaveBeenCalled();
  });

  // ── TC-F9: createRiskAlert 실패 → 예외 전파 안됨 (결제 흐름 유지) ──
  it('TC-F9: createRiskAlert 실패해도 evaluate()는 결과 반환', async () => {
    mockSecurity.createRiskAlert.mockRejectedValue(new Error('Alert 서버 오류'));

    const result = await service.evaluate({
      ...BASE_PARAMS,
      amount: FDS_RULES.SINGLE_TXN_LIMIT + 1,
    });

    // FDS 결과는 여전히 반환됨
    expect(result.blocked).toBe(true);
  });

  // ── TC-F10: 낮 시간 고액 → R4 미발동 ──
  it('TC-F10: KST 낮 시간(15시) 100만 원 초과 → R4 미발동 (WARN 없음)', async () => {
    // KST 15:00 = UTC 06:00 (KST 기준 낮)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-10T06:00:00.000Z'));

    const result = await service.evaluate({
      ...BASE_PARAMS,
      amount: FDS_RULES.NIGHT_HIGH_AMOUNT + 1,
    });

    expect(result.violations.filter((v) => v.ruleId === 'R4')).toHaveLength(0);
  });
});
