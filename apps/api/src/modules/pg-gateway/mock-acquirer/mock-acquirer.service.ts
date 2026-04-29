// ============================================================
// MockAcquirerService — CardProcessor + BankProcessor Facade
// Phase 4 결제 승인 엔진에서 이 서비스를 통해 Mock 카드사를 호출한다.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { CardProcessor } from './card-processor';
import { BankProcessor } from './bank-processor';
import type {
  CardApprovalRequest,
  CardApprovalResponse,
  CardCancelRequest,
  CardCancelResponse,
  BankTransferRequest,
  BankTransferResponse,
  VirtualAccountRequest,
  VirtualAccountResponse,
  AcquirerProvider,
} from '@pg-system/shared';

@Injectable()
export class MockAcquirerService implements AcquirerProvider {
  private readonly logger = new Logger(MockAcquirerService.name);
  readonly providerName = 'MOCK' as const;

  constructor(
    private readonly cardProcessor: CardProcessor,
    private readonly bankProcessor: BankProcessor,
  ) {
    this.logger.log('Mock Acquirer 활성화 — 실제 카드사/은행 연동 대신 시뮬레이터 동작 중');
  }

  /** 카드 결제 승인 요청을 CardProcessor에 위임한다. */
  async processCardPayment(
    params: CardApprovalRequest,
  ): Promise<CardApprovalResponse> {
    return this.cardProcessor.approve(params);
  }

  /** 카드 결제 취소 요청을 CardProcessor에 위임한다. */
  async cancelCardPayment(
    params: CardCancelRequest,
  ): Promise<CardCancelResponse> {
    return this.cardProcessor.cancel(params);
  }

  /** 계좌이체 요청을 BankProcessor에 위임한다. */
  async processBankTransfer(
    params: BankTransferRequest,
  ): Promise<BankTransferResponse> {
    return this.bankProcessor.transfer(params);
  }

  /** 가상계좌 발급 요청을 BankProcessor에 위임한다. */
  async createVirtualAccount(
    params: VirtualAccountRequest,
  ): Promise<VirtualAccountResponse> {
    return this.bankProcessor.createVirtualAccount(params);
  }
}
