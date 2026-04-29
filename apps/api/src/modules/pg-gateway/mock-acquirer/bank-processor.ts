// ============================================================
// BankProcessor — 계좌이체/가상계좌 시뮬레이터
// DB 의존성 없음. amount 끝자리 패턴으로 결과를 제어한다.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@pg-system/shared';
import type {
  BankTransferRequest,
  BankTransferResponse,
  VirtualAccountRequest,
  VirtualAccountResponse,
} from '@pg-system/shared';

/** 가상계좌 기본 만료 시간: 72시간(ms) */
const VIRTUAL_ACCOUNT_DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class BankProcessor {
  private readonly logger = new Logger(BankProcessor.name);

  /**
   * 계좌이체 시뮬레이션.
   *
   * 실패 규칙:
   *   - amount 끝 2자리 99 → 이체 실패 (ACQ_004)
   *   - 그 외 → 성공
   */
  async transfer(params: BankTransferRequest): Promise<BankTransferResponse> {
    const { bankCode, amount, merchantId } = params;
    const lastTwo = amount % 100;

    if (lastTwo === 99) {
      this.logger.warn(
        `[MockAcquirer] 은행 이체 실패 — merchantId=${merchantId} bankCode=${bankCode} amount=${amount}`,
      );
      return {
        success: false,
        errorCode: ERROR_CODES.ACQ_004,
        errorMessage: '은행 이체에 실패했습니다',
      };
    }

    const transactionId = this.generateTransactionId();

    this.logger.log(
      `[MockAcquirer] 이체 완료 — transactionId=${transactionId} bankCode=${bankCode}`,
    );

    return {
      success: true,
      transactionId,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * 가상계좌 발급 시뮬레이션.
   * 항상 성공한다.
   * expiresAt 미입력 시 현재로부터 72시간 후가 만료일이 된다.
   */
  async createVirtualAccount(
    params: VirtualAccountRequest,
  ): Promise<VirtualAccountResponse> {
    const { bankCode, customerName, expiresAt } = params;

    const accountNumber = this.generateVirtualAccountNumber(bankCode);
    const dueDate = expiresAt
      ? expiresAt
      : new Date(Date.now() + VIRTUAL_ACCOUNT_DEFAULT_TTL_MS).toISOString();

    this.logger.log(
      `[MockAcquirer] 가상계좌 발급 — accountNumber=${accountNumber} bankCode=${bankCode} customerName=${customerName} dueDate=${dueDate}`,
    );

    return {
      success: true,
      accountNumber,
      bankCode,
      dueDate,
    };
  }

  // ---- Private helpers ----

  private generateTransactionId(): string {
    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `BT${Date.now()}${randomPart}`;
  }

  /**
   * 가상계좌 번호 생성: bankCode + 현재 타임스탬프 끝 10자리
   * 예: 088 + 1234567890 → 0881234567890
   */
  private generateVirtualAccountNumber(bankCode: string): string {
    return `${bankCode}${Date.now().toString().slice(-10)}`;
  }
}
