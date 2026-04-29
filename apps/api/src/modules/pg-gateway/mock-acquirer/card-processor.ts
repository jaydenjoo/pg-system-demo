// ============================================================
// CardProcessor — 카드 결제 승인/취소 시뮬레이터
// 실제 카드사 API 대신 amount 끝자리 패턴으로 결과를 제어한다.
// ============================================================

import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../../prisma/prisma.service';
import { ERROR_CODES, CACHE_TTL } from '@pg-system/shared';
import type {
  CardApprovalRequest,
  CardApprovalResponse,
  CardCancelRequest,
  CardCancelResponse,
} from '@pg-system/shared';

/** 카드 BIN 조회 결과 (Prisma card_bins row 일부) */
interface CardBinRow {
  card_company: string;
  card_type: string;
}

@Injectable()
export class CardProcessor {
  private readonly logger = new Logger(CardProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * 카드 승인 시뮬레이션.
   *
   * 실패 시뮬레이션 규칙 (amount 끝 2자리 기준):
   *   - 99 → 카드사 거절 (ACQ_001)
   *   - 98 → 타임아웃    (ACQ_002)
   *   - 97 → 잔액 부족   (ACQ_003)
   *   - 그 외 → 정상 승인
   */
  async approve(params: CardApprovalRequest): Promise<CardApprovalResponse> {
    const { cardNumber, amount, merchantId } = params;
    const lastTwo = amount % 100;

    // ---- 실패 시뮬레이션 ----
    if (lastTwo === 99) {
      this.logger.warn(
        `[MockAcquirer] 카드사 거절 — merchantId=${merchantId} amount=${amount}`,
      );
      return {
        success: false,
        errorCode: ERROR_CODES.ACQ_001,
        errorMessage: '카드사가 결제를 거절했습니다',
      };
    }

    if (lastTwo === 98) {
      this.logger.warn(
        `[MockAcquirer] 카드사 타임아웃 — merchantId=${merchantId} amount=${amount}`,
      );
      return {
        success: false,
        errorCode: ERROR_CODES.ACQ_002,
        errorMessage: '카드사 응답 시간이 초과되었습니다',
      };
    }

    if (lastTwo === 97) {
      this.logger.warn(
        `[MockAcquirer] 잔액 부족 — merchantId=${merchantId} amount=${amount}`,
      );
      return {
        success: false,
        errorCode: ERROR_CODES.ACQ_003,
        errorMessage: '카드 잔액이 부족합니다',
      };
    }

    // ---- 정상 승인 ----
    const approvalNumber = this.generateApprovalNumber();
    const maskedCardNumber = this.maskCardNumber(cardNumber);

    // BIN(앞 6자리)으로 카드사 정보 조회
    const bin = cardNumber.slice(0, 6);
    const binInfo = await this.findCardBin(bin);

    const cardCompany = binInfo?.card_company ?? 'UNKNOWN';
    const cardType = binInfo?.card_type ?? 'CREDIT';

    this.logger.log(
      `[MockAcquirer] 승인 완료 — approvalNumber=${approvalNumber} cardCompany=${cardCompany} maskedCard=${maskedCardNumber}`,
    );

    return {
      success: true,
      approvalNumber,
      cardCompany,
      cardType,
      maskedCardNumber,
      approvedAt: new Date().toISOString(),
    };
  }

  /**
   * 카드 취소 시뮬레이션.
   * Mock이므로 항상 성공한다.
   */
  async cancel(params: CardCancelRequest): Promise<CardCancelResponse> {
    const cancelNumber = this.generateCancelNumber();

    this.logger.log(
      `[MockAcquirer] 취소 완료 — approvalNumber=${params.approvalNumber} cancelNumber=${cancelNumber}`,
    );

    return {
      success: true,
      cancelNumber,
      cancelledAt: new Date().toISOString(),
    };
  }

  // ---- Private helpers ----

  private async findCardBin(bin: string): Promise<CardBinRow | null> {
    const cacheKey = `card_bin:${bin}`;

    // Check cache first
    const cached = await this.cache.get<CardBinRow>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const row = await this.prisma.card_bins.findFirst({
        where: { bin_number: bin, is_active: true },
        select: { card_company: true, card_type: true },
      });

      // Store in cache only if found (don't cache null)
      if (row) {
        await this.cache.set(cacheKey, row, CACHE_TTL.CARD_BIN);
      }

      return row;
    } catch (err: unknown) {
      // DB 조회 실패 시 Unknown 처리 — 결제 자체는 계속 진행
      this.logger.error(
        `[MockAcquirer] BIN 조회 실패 — bin=${bin}`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  private generateApprovalNumber(): string {
    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `APR${Date.now()}${randomPart}`;
  }

  private generateCancelNumber(): string {
    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `CAN${Date.now()}${randomPart}`;
  }

  /**
   * 카드번호 마스킹: 앞 6자리 + ****
   * 카드번호 전체를 로그에 남기지 않는다.
   */
  private maskCardNumber(cardNumber: string): string {
    const prefix = cardNumber.slice(0, 6);
    return `${prefix}****`;
  }
}
