// ============================================================
// acquirer-factory.spec.ts — VAN_PROVIDER 환경변수 기반 DI Factory 테스트
// VAN_PROVIDER 값에 따라 올바른 Acquirer 어댑터가 주입되는지 검증한다.
// ============================================================

import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ACQUIRER_PROVIDER } from '@pg-system/shared';
import type { AcquirerProvider } from '@pg-system/shared';
import { MockAcquirerService } from '../mock-acquirer/mock-acquirer.service';
import { NiceAcquirerAdapter } from '../adapters/nice-acquirer.adapter';
import { KisAcquirerAdapter } from '../adapters/kis-acquirer.adapter';
import { CardProcessor } from '../mock-acquirer/card-processor';
import { BankProcessor } from '../mock-acquirer/bank-processor';

/**
 * acquirerFactory 로직 재현 — pg-gateway.module.ts와 동일한 useFactory.
 * 모듈 전체를 로드하지 않고 Factory 로직만 격리 테스트한다.
 */
const acquirerFactory = {
  provide: ACQUIRER_PROVIDER,
  useFactory: (
    config: ConfigService,
    mock: MockAcquirerService,
    nice: NiceAcquirerAdapter,
    kis: KisAcquirerAdapter,
  ): AcquirerProvider => {
    const provider = config.get<string>('van.provider', 'MOCK');
    switch (provider) {
      case 'NICE':
        return nice;
      case 'KIS':
        return kis;
      default:
        return mock;
    }
  },
  inject: [ConfigService, MockAcquirerService, NiceAcquirerAdapter, KisAcquirerAdapter],
};

// ---- Mock 의존성 ----
const mockCardProcessor = {
  approve: jest.fn(),
  cancel: jest.fn(),
};

const mockBankProcessor = {
  transfer: jest.fn(),
  createVirtualAccount: jest.fn(),
};

/**
 * 테스트 모듈 생성 헬퍼.
 * VAN_PROVIDER 환경변수를 주입하여 Factory 동작을 검증한다.
 */
async function createTestModule(vanProvider?: string): Promise<AcquirerProvider> {
  const envVars: Record<string, string> = {};
  if (vanProvider !== undefined) {
    envVars['VAN_PROVIDER'] = vanProvider;
  }

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        load: [
          () => ({
            van: {
              provider: envVars['VAN_PROVIDER'] ?? 'MOCK',
            },
          }),
        ],
      }),
    ],
    providers: [
      { provide: CardProcessor, useValue: mockCardProcessor },
      { provide: BankProcessor, useValue: mockBankProcessor },
      MockAcquirerService,
      NiceAcquirerAdapter,
      KisAcquirerAdapter,
      acquirerFactory,
    ],
  }).compile();

  return module.get<AcquirerProvider>(ACQUIRER_PROVIDER);
}

// ============================================================
// Test Suite
// ============================================================

describe('Acquirer Factory (VAN_PROVIDER 스위칭)', () => {
  it('VAN_PROVIDER=MOCK → MockAcquirerService 반환', async () => {
    const acquirer = await createTestModule('MOCK');

    expect(acquirer).toBeInstanceOf(MockAcquirerService);
    expect(acquirer.providerName).toBe('MOCK');
  });

  it('VAN_PROVIDER=NICE → NiceAcquirerAdapter 반환', async () => {
    const acquirer = await createTestModule('NICE');

    expect(acquirer).toBeInstanceOf(NiceAcquirerAdapter);
    expect(acquirer.providerName).toBe('NICE');
  });

  it('VAN_PROVIDER=KIS → KisAcquirerAdapter 반환', async () => {
    const acquirer = await createTestModule('KIS');

    expect(acquirer).toBeInstanceOf(KisAcquirerAdapter);
    expect(acquirer.providerName).toBe('KIS');
  });

  it('VAN_PROVIDER 미설정 → 기본값 MockAcquirerService 반환', async () => {
    const acquirer = await createTestModule(undefined);

    expect(acquirer).toBeInstanceOf(MockAcquirerService);
    expect(acquirer.providerName).toBe('MOCK');
  });

  it('NICE 어댑터 호출 시 미구현 에러 발생 (스켈레톤 확인)', async () => {
    const acquirer = await createTestModule('NICE');

    await expect(
      acquirer.processCardPayment({
        cardNumber: '4111111111111111',
        amount: 10000,
        installmentMonths: 0,
        merchantId: 'test-merchant',
      }),
    ).rejects.toThrow('NICE VAN 연동 미구현');
  });

  it('KIS 어댑터 호출 시 미구현 에러 발생 (스켈레톤 확인)', async () => {
    const acquirer = await createTestModule('KIS');

    await expect(
      acquirer.processCardPayment({
        cardNumber: '4111111111111111',
        amount: 10000,
        installmentMonths: 0,
        merchantId: 'test-merchant',
      }),
    ).rejects.toThrow('KIS VAN 연동 미구현');
  });
});
