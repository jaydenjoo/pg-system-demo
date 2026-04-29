// ============================================================
// NiceAcquirerAdapter — NICE VAN 스켈레톤 (계약 완료 후 실구현)
// ============================================================

import { Injectable } from '@nestjs/common';
import type {
  AcquirerProvider,
  CardApprovalRequest,
  CardApprovalResponse,
  CardCancelRequest,
  CardCancelResponse,
  BankTransferRequest,
  BankTransferResponse,
  VirtualAccountRequest,
  VirtualAccountResponse,
} from '@pg-system/shared';

@Injectable()
export class NiceAcquirerAdapter implements AcquirerProvider {
  readonly providerName = 'NICE' as const;

  async processCardPayment(
    _params: CardApprovalRequest,
  ): Promise<CardApprovalResponse> {
    throw new Error('NICE VAN 연동 미구현 — 계약 완료 후 구현');
  }

  async cancelCardPayment(
    _params: CardCancelRequest,
  ): Promise<CardCancelResponse> {
    throw new Error('NICE VAN 연동 미구현 — 계약 완료 후 구현');
  }

  async processBankTransfer(
    _params: BankTransferRequest,
  ): Promise<BankTransferResponse> {
    throw new Error('NICE VAN 연동 미구현 — 계약 완료 후 구현');
  }

  async createVirtualAccount(
    _params: VirtualAccountRequest,
  ): Promise<VirtualAccountResponse> {
    throw new Error('NICE VAN 연동 미구현 — 계약 완료 후 구현');
  }
}
