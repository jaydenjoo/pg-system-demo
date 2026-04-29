// ============================================================
// PG Fee Calculator — 3단계 수수료 조회 서비스
// 1순위: merchant_item_fees  (가맹점별 품목 요율)
// 2순위: merchant_commissions (가맹점 수수료)
// 3순위: pg_default_margins   (PG 기본 마진)
// ============================================================

import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CACHE_TTL } from '@pg-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

/** 수수료 계산 결과 */
export interface FeeCalculationResult {
  /** 적용된 수수료율 (%) */
  feeRate: number;
  /** 수수료 금액 (원) */
  feeAmount: bigint;
  /** 순 정산 금액 (원) */
  netAmount: bigint;
}

/** 수수료 설정이 없을 때 적용되는 기본 수수료율 (%) */
const DEFAULT_FEE_RATE = 3.5;

/**
 * @description PG 3단계 수수료 계산 서비스.
 * 가맹점별 결제 수수료를 우선순위에 따라 조회.
 * 1순위: merchant_item_fees (가맹점별 품목 요율)
 * 2순위: merchant_commissions (가맹점 수수료 계약)
 * 3순위: pg_default_margins (PG 기본 마진)
 * 폴백: 하드코딩 기본값 3.5%
 * @security PCI DSS 10.2.2 — 수수료 산출 과정 로깅
 * @audit 캐시 TTL 적용 (CACHE_TTL.FEE_RATE)으로 불필요한 DB 조회 방지
 */
@Injectable()
export class PgFeeCalculatorService {
  private readonly logger = new Logger(PgFeeCalculatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * @description 가맹점 수수료 계산. 3단계 우선순위로 요율 조회 후 BigInt 정수 연산으로 수수료 산출.
   * @param {string} merchantId - 가맹점 UUID
   * @param {string} paymentMethod - 결제 수단 코드 (CARD, BANK_TRANSFER 등)
   * @param {bigint} amount - 결제 금액 (BigInt)
   * @param {string} [cardCompany] - 카드사 코드 (CARD 결제 시만, 선택)
   * @returns {Promise<FeeCalculationResult>} 수수료 계산 결과 (feeRate, feeAmount, netAmount)
   * @security PCI DSS 10.2.2 — 수수료율 적용 출처 로깅 (1순위/2순위/3순위/폴백)
   */
  async calculate(
    merchantId: string,
    paymentMethod: string,
    amount: bigint,
    cardCompany?: string,
  ): Promise<FeeCalculationResult> {
    const today = new Date();

    const feeRate = await this.lookupFeeRate(
      merchantId,
      paymentMethod,
      cardCompany,
      today,
    );

    // BigInt 순수 연산: feeRate(소수점 2자리까지) × 100 → 정수 연산 후 10000으로 나누기
    // 예: 3.5% → 350 / 10000, 반올림을 위해 +5000
    const rateScaled = BigInt(Math.round(feeRate * 100)); // 3.5 → 350
    const feeAmount = (amount * rateScaled + 5000n) / 10000n;
    const netAmount = amount - feeAmount;

    this.logger.log(
      `[FeeCalculator] merchantId=${merchantId} method=${paymentMethod} amount=${amount} feeRate=${feeRate}% fee=${feeAmount} net=${netAmount}`,
    );

    return { feeRate, feeAmount, netAmount };
  }

  // ---- Private helpers ----

  private async lookupFeeRate(
    merchantId: string,
    paymentMethod: string,
    cardCompany: string | undefined,
    today: Date,
  ): Promise<number> {
    const dateStr = today.toISOString().split('T')[0];
    const cacheKey = `fee_rate:${merchantId}:${paymentMethod}:${cardCompany ?? 'ALL'}:${dateStr}`;

    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== undefined && cached !== null) {
      this.logger.debug(
        `[FeeCalculator] 캐시 히트 — key=${cacheKey} rate=${cached}`,
      );
      return cached;
    }

    // ── 1순위: merchant_item_fees ──
    const itemFee = await this.prisma.merchant_item_fees.findFirst({
      where: {
        merchant_id: merchantId,
        payment_method: paymentMethod,
        ...(cardCompany !== undefined ? { card_company: cardCompany } : {}),
        effective_from: { lte: today },
        OR: [{ effective_to: null }, { effective_to: { gte: today } }],
      },
      orderBy: { effective_from: 'desc' },
    });

    if (itemFee) {
      const rate = Number(itemFee.fee_rate);
      this.logger.debug(
        `[FeeCalculator] 1순위 적용 (merchant_item_fees) rate=${rate}`,
      );
      await this.cache.set(cacheKey, rate, CACHE_TTL.FEE_RATE);
      return rate;
    }

    // ── 2순위: merchant_commissions ──
    const commission = await this.prisma.merchant_commissions.findFirst({
      where: {
        merchant_id: merchantId,
        payment_method: paymentMethod,
        ...(cardCompany !== undefined ? { card_company: cardCompany } : {}),
        effective_from: { lte: today },
        OR: [{ effective_to: null }, { effective_to: { gte: today } }],
      },
      orderBy: { effective_from: 'desc' },
    });

    if (commission) {
      const rate = Number(commission.commission_rate);
      this.logger.debug(
        `[FeeCalculator] 2순위 적용 (merchant_commissions) rate=${rate}`,
      );
      await this.cache.set(cacheKey, rate, CACHE_TTL.FEE_RATE);
      return rate;
    }

    // ── 3순위: pg_default_margins ──
    const defaultMargin = await this.prisma.pg_default_margins.findFirst({
      where: {
        payment_method: paymentMethod,
        ...(cardCompany !== undefined ? { card_company: cardCompany } : {}),
        effective_from: { lte: today },
        OR: [{ effective_to: null }, { effective_to: { gte: today } }],
      },
      orderBy: { effective_from: 'desc' },
    });

    if (defaultMargin) {
      const rate = Number(defaultMargin.margin_rate);
      this.logger.debug(
        `[FeeCalculator] 3순위 적용 (pg_default_margins) rate=${rate}`,
      );
      await this.cache.set(cacheKey, rate, CACHE_TTL.FEE_RATE);
      return rate;
    }

    // ── 폴백: 하드코딩 기본값 ──
    this.logger.warn(
      `[FeeCalculator] 수수료 설정 없음 — merchantId=${merchantId} method=${paymentMethod} → 기본값 ${DEFAULT_FEE_RATE}% 사용`,
    );
    await this.cache.set(cacheKey, DEFAULT_FEE_RATE, CACHE_TTL.FEE_RATE);
    return DEFAULT_FEE_RATE;
  }
}
