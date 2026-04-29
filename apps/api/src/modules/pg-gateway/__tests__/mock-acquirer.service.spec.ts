// ============================================================
// Phase 3 테스트 — Mock 카드사/은행 프로세서 전체 검증
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CardProcessor } from '../mock-acquirer/card-processor';
import { BankProcessor } from '../mock-acquirer/bank-processor';
import { MockAcquirerService } from '../mock-acquirer/mock-acquirer.service';
import { VolatileMap } from '../mock-acquirer/volatile-map';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES } from '@pg-system/shared';

// ---- Mock Cache ----
const mockCache = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ---- Prisma Mock ----
const mockPrisma = {
  card_bins: {
    findFirst: jest.fn(),
  },
};

// ---- 픽스처 팩토리 ----
const makeCardBin = (overrides: Record<string, unknown> = {}) => ({
  id: 'bin-uuid-1',
  bin_number: '411111',
  card_company: 'SHINHAN',
  card_type: 'CREDIT',
  card_brand: 'VISA',
  is_active: true,
  ...overrides,
});

const makeCardApprovalParams = (overrides: Record<string, unknown> = {}) => ({
  cardNumber: '4111111111111111',
  amount: 10000,
  installmentMonths: 0,
  merchantId: 'merchant-uuid-1',
  ...overrides,
});

const makeCardCancelParams = (overrides: Record<string, unknown> = {}) => ({
  approvalNumber: 'APR17093847561234',
  cancelAmount: 10000,
  reason: '고객 요청',
  ...overrides,
});

const makeBankTransferParams = (overrides: Record<string, unknown> = {}) => ({
  bankCode: '088',
  accountNumber: '1234567890',
  amount: 10000,
  merchantId: 'merchant-uuid-1',
  ...overrides,
});

const makeVirtualAccountParams = (overrides: Record<string, unknown> = {}) => ({
  bankCode: '088',
  amount: 10000,
  customerName: '홍길동',
  ...overrides,
});

// ============================================================
// CardProcessor 테스트
// ============================================================
describe('CardProcessor', () => {
  let cardProcessor: CardProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    cardProcessor = module.get<CardProcessor>(CardProcessor);
    jest.clearAllMocks();
  });

  it('정상 금액(10000원) → 승인 성공, approvalNumber 존재', async () => {
    mockPrisma.card_bins.findFirst.mockResolvedValue(makeCardBin());

    const result = await cardProcessor.approve(makeCardApprovalParams());

    expect(result.success).toBe(true);
    expect(result.approvalNumber).toBeDefined();
    expect(result.approvalNumber).toMatch(/^APR\d+$/);
    expect(result.approvedAt).toBeDefined();
  });

  it('금액 끝자리 99 (10099원) → 카드사 거절 (ACQ_001)', async () => {
    const result = await cardProcessor.approve(
      makeCardApprovalParams({ amount: 10099 }),
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.ACQ_001);
  });

  it('금액 끝자리 98 (10098원) → 타임아웃 (ACQ_002)', async () => {
    const result = await cardProcessor.approve(
      makeCardApprovalParams({ amount: 10098 }),
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.ACQ_002);
  });

  it('금액 끝자리 97 (10097원) → 잔액 부족 (ACQ_003)', async () => {
    const result = await cardProcessor.approve(
      makeCardApprovalParams({ amount: 10097 }),
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.ACQ_003);
  });

  it('card_bins에 등록된 BIN → 올바른 cardCompany 반환', async () => {
    mockPrisma.card_bins.findFirst.mockResolvedValue(makeCardBin());

    const result = await cardProcessor.approve(makeCardApprovalParams());

    expect(result.success).toBe(true);
    expect(result.cardCompany).toBe('SHINHAN');
    expect(result.cardType).toBe('CREDIT');
  });

  it('card_bins에 미등록 BIN → UNKNOWN 카드사 반환', async () => {
    mockPrisma.card_bins.findFirst.mockResolvedValue(null);

    const result = await cardProcessor.approve(makeCardApprovalParams());

    expect(result.success).toBe(true);
    expect(result.cardCompany).toBe('UNKNOWN');
    expect(result.cardType).toBe('CREDIT');
  });

  it('카드번호 마스킹 검증 (앞 6자리 + ****)', async () => {
    mockPrisma.card_bins.findFirst.mockResolvedValue(makeCardBin());

    const result = await cardProcessor.approve(
      makeCardApprovalParams({ cardNumber: '4111111111111111' }),
    );

    expect(result.maskedCardNumber).toBe('411111****');
  });

  it('할부 개월수 0 → 일시불 처리 (승인 성공)', async () => {
    mockPrisma.card_bins.findFirst.mockResolvedValue(makeCardBin());

    const result = await cardProcessor.approve(
      makeCardApprovalParams({ installmentMonths: 0 }),
    );

    expect(result.success).toBe(true);
  });

  it('취소 요청 → 항상 성공 + cancelNumber 반환', async () => {
    const result = await cardProcessor.cancel(makeCardCancelParams());

    expect(result.success).toBe(true);
    expect(result.cancelNumber).toBeDefined();
    expect(result.cancelNumber).toMatch(/^CAN\d+$/);
    expect(result.cancelledAt).toBeDefined();
  });
});

// ============================================================
// BankProcessor 테스트
// ============================================================
describe('BankProcessor', () => {
  let bankProcessor: BankProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BankProcessor],
    }).compile();

    bankProcessor = module.get<BankProcessor>(BankProcessor);
    jest.clearAllMocks();
  });

  it('정상 이체 (10000원) → 성공 + transactionId 반환', async () => {
    const result = await bankProcessor.transfer(makeBankTransferParams());

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.transactionId).toMatch(/^BT\d+$/);
    expect(result.completedAt).toBeDefined();
  });

  it('금액 끝자리 99 → 이체 실패 (ACQ_004)', async () => {
    const result = await bankProcessor.transfer(
      makeBankTransferParams({ amount: 10099 }),
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ERROR_CODES.ACQ_004);
  });

  it('가상계좌 발급 → accountNumber + dueDate 반환', async () => {
    const result = await bankProcessor.createVirtualAccount(
      makeVirtualAccountParams(),
    );

    expect(result.success).toBe(true);
    expect(result.accountNumber).toBeDefined();
    expect(result.bankCode).toBe('088');
    expect(result.dueDate).toBeDefined();
  });

  it('가상계좌 만료일 기본값 72시간 검증', async () => {
    const beforeCall = Date.now();
    const result = await bankProcessor.createVirtualAccount(
      makeVirtualAccountParams(),
    );
    const afterCall = Date.now();

    expect(result.dueDate).toBeDefined();

    const dueDate = new Date(result.dueDate!).getTime();
    const expectedMin = beforeCall + 72 * 60 * 60 * 1000;
    const expectedMax = afterCall + 72 * 60 * 60 * 1000;

    expect(dueDate).toBeGreaterThanOrEqual(expectedMin);
    expect(dueDate).toBeLessThanOrEqual(expectedMax);
  });

  it('가상계좌 expiresAt 직접 지정 시 해당 값 사용', async () => {
    const customExpiry = '2026-12-31T23:59:59.000Z';
    const result = await bankProcessor.createVirtualAccount(
      makeVirtualAccountParams({ expiresAt: customExpiry }),
    );

    expect(result.dueDate).toBe(customExpiry);
  });
});

// ============================================================
// MockAcquirerService — Facade 위임 테스트
// ============================================================
describe('MockAcquirerService', () => {
  let service: MockAcquirerService;
  let cardProcessor: CardProcessor;
  let bankProcessor: BankProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockAcquirerService,
        CardProcessor,
        BankProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<MockAcquirerService>(MockAcquirerService);
    cardProcessor = module.get<CardProcessor>(CardProcessor);
    bankProcessor = module.get<BankProcessor>(BankProcessor);
    jest.clearAllMocks();
  });

  it('processCardPayment → CardProcessor.approve 위임 확인', async () => {
    const approveSpy = jest
      .spyOn(cardProcessor, 'approve')
      .mockResolvedValue({ success: true, approvalNumber: 'APR001' });

    const params = makeCardApprovalParams();
    const result = await service.processCardPayment(params);

    expect(approveSpy).toHaveBeenCalledWith(params);
    expect(result.approvalNumber).toBe('APR001');
  });

  it('cancelCardPayment → CardProcessor.cancel 위임 확인', async () => {
    const cancelSpy = jest
      .spyOn(cardProcessor, 'cancel')
      .mockResolvedValue({ success: true, cancelNumber: 'CAN001' });

    const params = makeCardCancelParams();
    const result = await service.cancelCardPayment(params);

    expect(cancelSpy).toHaveBeenCalledWith(params);
    expect(result.cancelNumber).toBe('CAN001');
  });

  it('processBankTransfer → BankProcessor.transfer 위임 확인', async () => {
    const transferSpy = jest
      .spyOn(bankProcessor, 'transfer')
      .mockResolvedValue({ success: true, transactionId: 'BT001' });

    const params = makeBankTransferParams();
    const result = await service.processBankTransfer(params);

    expect(transferSpy).toHaveBeenCalledWith(params);
    expect(result.transactionId).toBe('BT001');
  });

  it('createVirtualAccount → BankProcessor.createVirtualAccount 위임 확인', async () => {
    const vaSpy = jest
      .spyOn(bankProcessor, 'createVirtualAccount')
      .mockResolvedValue({
        success: true,
        accountNumber: '0881234567890',
        bankCode: '088',
        dueDate: '2026-12-31T23:59:59.000Z',
      });

    const params = makeVirtualAccountParams();
    const result = await service.createVirtualAccount(params);

    expect(vaSpy).toHaveBeenCalledWith(params);
    expect(result.accountNumber).toBe('0881234567890');
  });
});

// ============================================================
// VolatileMap 테스트
// ============================================================
describe('VolatileMap', () => {
  let map: VolatileMap<string>;

  beforeEach(() => {
    map = new VolatileMap<string>();
  });

  it('set/get 기본 동작 — 저장 후 값 반환', () => {
    map.set('key1', 'value1', 60_000);
    expect(map.get('key1')).toBe('value1');
  });

  it('TTL 만료 후 get → undefined', () => {
    // TTL 0ms → 즉시 만료
    map.set('key1', 'value1', 0);
    // Date.now()가 expiresAt보다 크도록 약간 대기
    // TTL=0이면 expiresAt = Date.now() + 0, 다음 get 시 만료
    // 실제로는 set 직후 Date.now() >= expiresAt이 성립할 수 있음
    void map.get('key1');
    // TTL=0 or 1ms 이후이므로 undefined 또는 value1일 수 있음
    // 확실한 테스트를 위해 음수 TTL 사용
    map.set('key2', 'value2', -1);
    expect(map.get('key2')).toBeUndefined();
  });

  it('has() — 존재하는 키 → true', () => {
    map.set('key1', 'value1', 60_000);
    expect(map.has('key1')).toBe(true);
  });

  it('has() — 만료된 키 → false', () => {
    map.set('key1', 'value1', -1);
    expect(map.has('key1')).toBe(false);
  });

  it('size() — 만료 제외 카운트', () => {
    map.set('key1', 'value1', 60_000);  // 유효
    map.set('key2', 'value2', -1);       // 만료
    map.set('key3', 'value3', 60_000);  // 유효
    expect(map.size()).toBe(2);
  });

  it('delete — 존재하는 키 삭제 후 true 반환', () => {
    map.set('key1', 'value1', 60_000);
    expect(map.delete('key1')).toBe(true);
    expect(map.get('key1')).toBeUndefined();
  });

  it('delete — 존재하지 않는 키 → false 반환', () => {
    expect(map.delete('nonexistent')).toBe(false);
  });

  it('clear — 모든 항목 삭제', () => {
    map.set('key1', 'value1', 60_000);
    map.set('key2', 'value2', 60_000);
    map.clear();
    expect(map.size()).toBe(0);
    expect(map.get('key1')).toBeUndefined();
  });
});
