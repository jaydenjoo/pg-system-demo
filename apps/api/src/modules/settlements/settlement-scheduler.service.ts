// ============================================================
// B-1: 정산 자동화 스케줄러
// 매일 새벽 02:00에 전체 가맹점 정산 배치 실행
// 주기별(D+1/D+2/D+3/WEEKLY/MONTHLY) 집계 기간 자동 계산
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../security/security.service';
import { SettlementAutoExecutionService } from './settlement-auto-execution.service';
import { SETTLEMENT_QUEUE } from './settlement.processor';
import type { SettlementJobData, SettlementJobType } from './settlement.processor';
import {
  MERCHANT_STATUS,
  SETTLEMENT_STATUS,
  SETTLEMENT_CYCLES,
  TRANSACTION_STATUS,
  ERROR_CODES,
} from '@pg-system/shared';
import type { SettlementCycleCode } from '@pg-system/shared';

/** 정산 기간 */
interface SettlementPeriod {
  from: Date;
  to: Date;
}

/** 가맹점별 배치 결과 */
interface MerchantBatchResult {
  merchantId: string;
  success: boolean;
  errorMessage?: string;
}

@Injectable()
export class SettlementSchedulerService {
  private readonly logger = new Logger(SettlementSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly autoExecution: SettlementAutoExecutionService,
    @InjectQueue(SETTLEMENT_QUEUE) private readonly settlementQueue: Queue<SettlementJobData>,
  ) {}

  /**
   * 큐에 Job 등록 시도 → Redis 미연결 시 동기 실행 폴백.
   * 비유: 택배 접수 시도 → 접수처가 닫혀있으면 직접 배달.
   */
  private async dispatchOrFallback(
    type: SettlementJobType,
    fallback: () => Promise<void>,
  ): Promise<void> {
    try {
      await this.settlementQueue.add(type, { type });
      this.logger.log(`[SettlementScheduler] Job 큐 등록 — type=${type}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[SettlementScheduler] 큐 등록 실패, 동기 실행 폴백 — ${msg}`);
      await fallback();
    }
  }

  /**
   * 매일 새벽 02:00 정산 배치 실행 (cron: "분 시 일 월 요일")
   * 어제 날짜 기준으로 각 가맹점의 settlement_cycle에 따라 집계 기간을 결정.
   */
  @Cron('0 2 * * *')
  async handleDailySettlement(): Promise<void> {
    const today = new Date();
    // 오늘 02:00에 실행 → 어제까지의 거래를 정산 (UTC 기준 통일)
    const baseDate = new Date(today);
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    baseDate.setUTCHours(0, 0, 0, 0);

    this.logger.log(
      `[SettlementScheduler] 배치 시작 — baseDate=${baseDate.toISOString().slice(0, 10)}`,
    );

    // ACTIVE 가맹점 전체 조회
    const merchants = await this.prisma.merchants.findMany({
      where: { status: MERCHANT_STATUS.ACTIVE },
      select: { id: true, merchant_name: true, settlement_cycle: true },
    });

    if (merchants.length === 0) {
      this.logger.log('[SettlementScheduler] 활성 가맹점 없음 — 종료');
      return;
    }

    const results: MerchantBatchResult[] = [];

    for (const merchant of merchants) {
      const cycle = merchant.settlement_cycle as SettlementCycleCode;

      // WEEKLY/MONTHLY는 실행 요일/일자 조건에 맞을 때만 처리
      if (!this.shouldRunForCycle(cycle, baseDate)) {
        this.logger.debug(
          `[SettlementScheduler] 실행 조건 미충족 — merchantId=${merchant.id} cycle=${cycle}`,
        );
        continue;
      }

      try {
        await this.processOneMerchant(
          merchant.id,
          cycle,
          baseDate,
        );
        results.push({ merchantId: merchant.id, success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[SettlementScheduler] 가맹점 정산 실패 — merchantId=${merchant.id} error=${message}`,
        );
        results.push({ merchantId: merchant.id, success: false, errorMessage: message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(
      `[SettlementScheduler] 배치 완료 — total=${merchants.length} succeeded=${succeeded} failed=${failed}`,
    );

    // 감사 로그 기록 (PCI DSS 10.2.2)
    await this.security.writeAuditLog({
      action: 'SETTLEMENT_BATCH',
      resourceType: 'settlements',
      detail: {
        baseDate: baseDate.toISOString().slice(0, 10),
        total: merchants.length,
        succeeded,
        failed,
        failedMerchants: results.filter((r) => !r.success).map((r) => r.merchantId),
        errorCode: failed > 0 ? ERROR_CODES.STL_004 : null,
      },
    });
  }

  /**
   * 가맹점 1건 정산 처리. 기간 내 APPROVED 거래를 집계하여
   * settlements + agent_settlements 레코드를 원자적으로 생성.
   */
  private async processOneMerchant(
    merchantId: string,
    cycle: SettlementCycleCode,
    baseDate: Date,
  ): Promise<void> {
    const { from, to } = this.calculatePeriod(cycle, baseDate);
    const settlementDate = new Date(baseDate);

    // 이미 해당 일자에 정산이 생성된 경우 skip (중복 방지)
    const existing = await this.prisma.settlements.count({
      where: { merchant_id: merchantId, settlement_date: settlementDate },
    });
    if (existing > 0) {
      this.logger.debug(
        `[SettlementScheduler] 이미 정산 존재 — merchantId=${merchantId} date=${settlementDate.toISOString().slice(0, 10)}`,
      );
      return;
    }

    // 기간 내 승인 거래 집계
    const txns = await this.prisma.transactions.findMany({
      where: {
        merchant_id: merchantId,
        status: TRANSACTION_STATUS.APPROVED,
        approved_at: { gte: from, lte: to },
      },
      select: {
        id: true,
        tran_type: true,
        amount: true,
        fee_amount: true,
        net_amount: true,
      },
    });

    if (txns.length === 0) {
      this.logger.debug(
        `[SettlementScheduler] 집계 거래 없음 — merchantId=${merchantId}`,
      );
      return;
    }

    const totalAmount = txns.reduce((s, t) => s + t.amount, BigInt(0));
    const totalFee = txns.reduce((s, t) => s + t.fee_amount, BigInt(0));
    const totalNet = txns.reduce((s, t) => s + t.net_amount, BigInt(0));
    const tranCount = txns.filter((t) => t.tran_type === 'PAYMENT').length;
    const cancelCount = txns.filter((t) => t.tran_type === 'CANCEL').length;

    // 대리점 ID 조회
    const merchant = await this.prisma.merchants.findFirst({
      where: { id: merchantId },
      select: { agent_id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.settlements.create({
        data: {
          merchant_id: merchantId,
          settlement_date: settlementDate,
          period_from: from,
          period_to: to,
          total_amount: totalAmount,
          total_fee: totalFee,
          total_net: totalNet,
          deduction: BigInt(0),
          payout_amount: totalNet,
          tran_count: tranCount,
          cancel_count: cancelCount,
          status: SETTLEMENT_STATUS.CALCULATED,
          created_by: 'SYSTEM_BATCH',
        },
      });

      if (merchant?.agent_id) {
        await tx.agent_settlements.create({
          data: {
            agent_id: merchant.agent_id,
            settlement_date: settlementDate,
            period_from: from,
            period_to: to,
            total_commission: totalFee,
            tran_count: tranCount,
            created_by: 'SYSTEM_BATCH',
          },
        });
      }
    });
  }

  /**
   * 주기별 실행 조건 판단.
   * D+1/D+2/D+3: 매일 실행
   * WEEKLY: 월요일만 실행 (일~토 = 0~6, 월요일 = 1)
   * MONTHLY: 매월 1일만 실행
   */
  public shouldRunForCycle(cycle: SettlementCycleCode, baseDate: Date): boolean {
    switch (cycle) {
      case SETTLEMENT_CYCLES.D1:
      case SETTLEMENT_CYCLES.D2:
      case SETTLEMENT_CYCLES.D3:
        return true;
      case SETTLEMENT_CYCLES.WEEKLY:
        // 월요일(1)에만 실행 → 지난주 월~일 정산
        return baseDate.getUTCDay() === 1;
      case SETTLEMENT_CYCLES.MONTHLY:
        // 매월 1일에만 실행 → 전월 정산
        return baseDate.getUTCDate() === 1;
      default:
        return true;
    }
  }

  /**
   * 정산 주기(cycle)와 기준일(baseDate)로 집계 기간을 계산.
   * @example
   *   calculatePeriod('D+1', new Date('2024-01-02')) → { from: 2024-01-01, to: 2024-01-01 }
   *   calculatePeriod('WEEKLY', new Date('2024-01-07')) → { from: 2024-01-01, to: 2024-01-07 }
   */
  public calculatePeriod(cycle: SettlementCycleCode, baseDate: Date): SettlementPeriod {
    const base = new Date(baseDate);
    base.setUTCHours(0, 0, 0, 0);

    const endOfDay = (d: Date): Date => {
      const end = new Date(d);
      end.setUTCHours(23, 59, 59, 999);
      return end;
    };

    const subtractDays = (d: Date, days: number): Date => {
      const result = new Date(d);
      result.setUTCDate(result.getUTCDate() - days);
      return result;
    };

    switch (cycle) {
      case SETTLEMENT_CYCLES.D1: {
        // D+1: 어제 하루
        const from = subtractDays(base, 0);
        return { from, to: endOfDay(from) };
      }
      case SETTLEMENT_CYCLES.D2: {
        // D+2: 2일 전 하루
        const from = subtractDays(base, 1);
        return { from, to: endOfDay(from) };
      }
      case SETTLEMENT_CYCLES.D3: {
        // D+3: 3일 전 하루
        const from = subtractDays(base, 2);
        return { from, to: endOfDay(from) };
      }
      case SETTLEMENT_CYCLES.WEEKLY: {
        // WEEKLY: 지난 7일(baseDate 포함)
        const from = subtractDays(base, 6);
        return { from, to: endOfDay(base) };
      }
      case SETTLEMENT_CYCLES.MONTHLY: {
        // MONTHLY: 지난달 1일 ~ 말일
        const firstOfLastMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1));
        const lastOfLastMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 0));
        return { from: firstOfLastMonth, to: endOfDay(lastOfLastMonth) };
      }
      default: {
        // 알 수 없는 주기 → D+1 fallback
        const from = subtractDays(base, 0);
        return { from, to: endOfDay(from) };
      }
    }
  }

  // ============================================================
  // 정산 자동 실행 스케줄러 (CALCULATED → CONFIRMED → REMITTED → COMPLETED)
  // ============================================================

  /**
   * 매일 03:00 — CALCULATED → CONFIRMED 자동 전환
   * Redis 연결 시 큐에 Job 등록 (비블로킹), 미연결 시 동기 실행 폴백
   */
  @Cron('0 3 * * *')
  async handleAutoConfirmSettlements(): Promise<void> {
    this.logger.log('[SettlementScheduler] 자동 확정(CONFIRMED) 배치 시작');
    await this.dispatchOrFallback('auto-confirm', async () => {
      const result = await this.autoExecution.autoConfirmSettlements();
      this.logger.log(
        `[SettlementScheduler] 자동 확정 완료 — processed=${result.processed} failed=${result.failed}`,
      );
    });
  }

  /**
   * 평일 09:00 — CONFIRMED → REMITTED 자동 송금
   * Redis 연결 시 큐에 Job 등록 (비블로킹), 미연결 시 동기 실행 폴백
   */
  @Cron('0 9 * * 1-5')
  async handleAutoRemitSettlements(): Promise<void> {
    this.logger.log('[SettlementScheduler] 자동 송금(REMITTED) 배치 시작');
    await this.dispatchOrFallback('auto-remit', async () => {
      const result = await this.autoExecution.autoRemitSettlements();
      this.logger.log(
        `[SettlementScheduler] 자동 송금 완료 — processed=${result.processed} failed=${result.failed}`,
      );
    });
  }

  /**
   * 평일 15:00 — REMITTED → COMPLETED 자동 완료
   * Redis 연결 시 큐에 Job 등록 (비블로킹), 미연결 시 동기 실행 폴백
   */
  @Cron('0 15 * * 1-5')
  async handleAutoCompleteSettlements(): Promise<void> {
    this.logger.log('[SettlementScheduler] 자동 완료(COMPLETED) 배치 시작');
    await this.dispatchOrFallback('auto-complete', async () => {
      const result = await this.autoExecution.autoCompleteSettlements();
      this.logger.log(
        `[SettlementScheduler] 자동 완료 완료 — processed=${result.processed} failed=${result.failed}`,
      );
    });
  }
}
