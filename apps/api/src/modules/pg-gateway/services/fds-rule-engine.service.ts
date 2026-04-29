// ============================================================
// B-3: FDS (이상거래탐지) 룰엔진 서비스
// 결제 승인 전 5가지 룰을 평가하여 BLOCK/WARN 판정
// R1: 단건 고액 차단
// R2: 시간당 가맹점 누적 한도
// R3: 시간당 동일 카드 빈도
// R4: 심야 고액 경고
// R5: 연속 거절 차단
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';
import {
  FDS_RULES,
  PG_PAYMENT_STATUS,
} from '@pg-system/shared';
import type { FdsEvaluationResult, FdsViolation } from '@pg-system/shared';

/** FDS 평가 요청 파라미터 */
export interface FdsEvalParams {
  merchantId: string;
  amount: number;
  /** 카드 번호 (마스킹 전 원본, 마지막 4자리만 룰에 사용) */
  cardNumber: string;
  paymentKey: string;
}

/**
 * @description FDS(Fraud Detection System) 이상거래 탐지 룰엔진.
 * 결제 승인 전 5가지 룰을 순차 평가하여 BLOCK(차단) 또는 WARN(경고) 판정.
 * R1: 단건 고액 차단 (500만 원 초과)
 * R2: 시간당 가맹점 누적 한도 (1,000만 원 초과)
 * R3: 시간당 동일 카드 빈도 (5회 초과)
 * R4: 심야 고액 경고 (23~05시 100만 원 초과)
 * R5: 연속 거절 차단 (30분 내 3회 이상)
 * @security PCI DSS 6.1 — 취약점 식별 및 위험 등급 부여
 * @security PCI DSS 10.6 — 이상 활동 탐지를 위한 로그 검토 메커니즘
 * @audit 위반 탐지 시 SecurityService.createRiskAlert로 리스크 알림 생성
 */
@Injectable()
export class FdsRuleEngineService {
  private readonly logger = new Logger(FdsRuleEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  /**
   * @description 5가지 FDS 룰을 순차 평가하여 이상거래 여부 판정.
   * BLOCK 룰 위반 시 즉시 차단(blocked=true), WARN 룰은 경고만 기록하고 결제 진행.
   * 각 BLOCK 룰 위반 후 조기 반환으로 불필요한 추가 검사 방지.
   * @param {FdsEvalParams} params - 평가 대상 (merchantId, amount, cardNumber, paymentKey)
   * @returns {Promise<FdsEvaluationResult>} 판정 결과 (blocked, warnings, violations)
   * @security PCI DSS 10.6 — 이상 패턴 실시간 탐지
   * @audit 위반 시 SecurityService.createRiskAlert 호출 (fire-and-forget 아닌 await)
   */
  async evaluate(params: FdsEvalParams): Promise<FdsEvaluationResult> {
    const violations: FdsViolation[] = [];

    // R1: 단건 고액 차단
    const r1 = this.checkR1(params.amount);
    if (r1) violations.push(r1);

    // BLOCK 조기 반환
    if (violations.some((v) => v.action === 'BLOCK')) {
      await this.handleViolations(violations, params);
      return this.buildResult(violations);
    }

    // R2: 1시간 누적 결제 한도
    const r2 = await this.checkR2(params.merchantId, params.amount);
    if (r2) violations.push(r2);

    if (violations.some((v) => v.action === 'BLOCK')) {
      await this.handleViolations(violations, params);
      return this.buildResult(violations);
    }

    // R3: 시간당 동일 카드 빈도
    const r3 = await this.checkR3(params.merchantId, params.cardNumber);
    if (r3) violations.push(r3);

    if (violations.some((v) => v.action === 'BLOCK')) {
      await this.handleViolations(violations, params);
      return this.buildResult(violations);
    }

    // R4: 심야 고액 경고 (WARN — 차단하지 않음)
    const r4 = this.checkR4(params.amount);
    if (r4) violations.push(r4);

    // R5: 연속 거절 차단
    const r5 = await this.checkR5(params.merchantId);
    if (r5) violations.push(r5);

    if (violations.some((v) => v.action === 'BLOCK')) {
      await this.handleViolations(violations, params);
      return this.buildResult(violations);
    }

    // 경고만 있는 경우도 처리
    if (violations.length > 0) {
      await this.handleViolations(violations, params);
    }

    return this.buildResult(violations);
  }

  // ──────────────────────────────────────────────
  // 룰별 체크 메서드
  // ──────────────────────────────────────────────

  /** R1: 단건 결제 금액이 500만 원 초과 → BLOCK */
  private checkR1(amount: number): FdsViolation | null {
    if (amount > FDS_RULES.SINGLE_TXN_LIMIT) {
      return {
        ruleId: 'R1',
        severity: 'HIGH',
        action: 'BLOCK',
        message: `단건 결제 한도 초과 (amount=${amount} > limit=${FDS_RULES.SINGLE_TXN_LIMIT})`,
      };
    }
    return null;
  }

  /** R2: 1시간 내 가맹점 누적 결제 1,000만 원 초과 → BLOCK */
  private async checkR2(merchantId: string, amount: number): Promise<FdsViolation | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const agg = await this.prisma.pg_payment_orders.aggregate({
      where: {
        merchant_id: merchantId,
        status: PG_PAYMENT_STATUS.DONE,
        approved_at: { gte: oneHourAgo },
      },
      _sum: { amount: true },
    });

    const hourlyTotal = Number(agg._sum.amount ?? BigInt(0));
    if (hourlyTotal + amount > FDS_RULES.HOURLY_MERCHANT_LIMIT) {
      return {
        ruleId: 'R2',
        severity: 'HIGH',
        action: 'BLOCK',
        message: `시간당 누적 한도 초과 (hourly=${hourlyTotal} + new=${amount} > limit=${FDS_RULES.HOURLY_MERCHANT_LIMIT})`,
      };
    }
    return null;
  }

  /** R3: 1시간 내 동일 카드 마지막 4자리 결제 5회 초과 → BLOCK */
  private async checkR3(merchantId: string, cardNumber: string): Promise<FdsViolation | null> {
    const last4 = cardNumber.slice(-4);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const count = await this.prisma.transactions.count({
      where: {
        merchant_id: merchantId,
        approved_at: { gte: oneHourAgo },
        payment_detail: {
          path: ['maskedCardNumber'],
          string_ends_with: last4,
        },
      },
    });

    if (count > FDS_RULES.HOURLY_CARD_COUNT_LIMIT) {
      return {
        ruleId: 'R3',
        severity: 'HIGH',
        action: 'BLOCK',
        message: `동일 카드 빈도 초과 (count=${count} > limit=${FDS_RULES.HOURLY_CARD_COUNT_LIMIT} last4=****${last4})`,
      };
    }
    return null;
  }

  /**
   * R4: 심야 시간대(KST 23:00~05:00) 100만 원 초과 → WARN
   * UTC → KST 변환: (utcHour + 9) % 24
   * jest에서 시간 조작이 필요할 경우 jest.useFakeTimers() 사용
   */
  private checkR4(amount: number): FdsViolation | null {
    const utcHour = new Date().getUTCHours();
    const kstHour = (utcHour + 9) % 24;
    const isNight = kstHour >= FDS_RULES.NIGHT_START_HOUR || kstHour < FDS_RULES.NIGHT_END_HOUR;

    if (isNight && amount > FDS_RULES.NIGHT_HIGH_AMOUNT) {
      return {
        ruleId: 'R4',
        severity: 'MEDIUM',
        action: 'WARN',
        message: `심야 고액 결제 감지 (KST=${kstHour}시 amount=${amount} > limit=${FDS_RULES.NIGHT_HIGH_AMOUNT})`,
      };
    }
    return null;
  }

  /** R5: 30분 내 ABORTED 3회 이상 → BLOCK */
  private async checkR5(merchantId: string): Promise<FdsViolation | null> {
    const windowStart = new Date(Date.now() - FDS_RULES.CONSECUTIVE_FAIL_WINDOW_MS);

    const count = await this.prisma.pg_payment_orders.count({
      where: {
        merchant_id: merchantId,
        status: PG_PAYMENT_STATUS.ABORTED,
        created_at: { gte: windowStart },
      },
    });

    if (count >= FDS_RULES.CONSECUTIVE_FAIL_LIMIT) {
      return {
        ruleId: 'R5',
        severity: 'HIGH',
        action: 'BLOCK',
        message: `연속 거절 감지 (aborted=${count} >= limit=${FDS_RULES.CONSECUTIVE_FAIL_LIMIT} in last 30min)`,
      };
    }
    return null;
  }

  // ──────────────────────────────────────────────
  // 위반 처리 & 결과 조립
  // ──────────────────────────────────────────────

  /** 위반 항목에 대해 SecurityService.createRiskAlert 호출 */
  private async handleViolations(
    violations: FdsViolation[],
    params: FdsEvalParams,
  ): Promise<void> {
    for (const v of violations) {
      try {
        await this.security.createRiskAlert({
          alertType: `FDS_${v.ruleId}`,
          severity: v.severity,
          description: v.message,
          merchantId: params.merchantId,
          transactionId: params.paymentKey,
        });
      } catch (err: unknown) {
        // 리스크 알림 실패가 결제 흐름을 막지 않도록 예외 포착
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[FDS] createRiskAlert 실패 — ruleId=${v.ruleId} error=${message}`,
        );
      }
    }
  }

  private buildResult(violations: FdsViolation[]): FdsEvaluationResult {
    const blocked = violations.some((v) => v.action === 'BLOCK');
    const warnings = violations
      .filter((v) => v.action === 'WARN')
      .map((v) => v.message);

    return { blocked, warnings, violations };
  }
}
