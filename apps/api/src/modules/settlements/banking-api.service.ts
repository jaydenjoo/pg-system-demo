// ============================================================
// Banking API 스텁 서비스
// 오픈뱅킹 실연동 전까지 mock 성공 반환
// ============================================================

import { Injectable, Logger } from '@nestjs/common';

/** 송금 요청 파라미터 */
export interface TransferRequest {
  /** 은행 코드 (예: '088' = 신한, '004' = KB) */
  bankCode: string;
  /** 계좌번호 */
  accountNumber: string;
  /** 송금 금액 (원) */
  amount: bigint;
  /** 참조 번호 (정산 ID 등) */
  reference: string;
  /** 예금주 */
  accountHolder?: string;
}

/** 송금 결과 */
export interface TransferResult {
  /** 성공 여부 */
  success: boolean;
  /** 은행 참조 번호 (송금 확인용) */
  referenceId: string;
  /** 실패 시 에러 메시지 */
  errorMessage?: string;
}

/**
 * 은행 송금 API 서비스 (스텁)
 *
 * 비유: 아직 은행 창구가 열리지 않아서,
 * "송금 완료" 도장만 찍어주는 임시 창구.
 * 오픈뱅킹 계약 완료 후 실제 API로 교체.
 */
@Injectable()
export class BankingApiService {
  private readonly logger = new Logger(BankingApiService.name);

  /**
   * 계좌 송금 실행 (현재: mock 성공 반환)
   *
   * @param request 송금 요청 정보
   * @returns 송금 결과 (스텁: 항상 성공)
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const referenceId = `BANK-${ts}-${rand}`;

    this.logger.log(
      `[BankingApi] 송금 요청 (STUB) — ref=${request.reference} amount=${request.amount} bank=${request.bankCode}`,
    );

    // TODO: 오픈뱅킹 실연동 시 이 부분을 실제 API 호출로 교체
    // const response = await this.httpService.post('https://openbanking.or.kr/...', { ... });

    this.logger.log(
      `[BankingApi] 송금 완료 (STUB) — referenceId=${referenceId}`,
    );

    return {
      success: true,
      referenceId,
    };
  }
}
