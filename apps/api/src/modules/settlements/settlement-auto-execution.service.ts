// ============================================================
// 정산 자동 실행 서비스
// CALCULATED → CONFIRMED → REMITTED → COMPLETED 자동 전환
// 각 단계별 조건 충족 시 배치 처리
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../security/security.service';
import { BankingApiService } from './banking-api.service';
import { SETTLEMENT_STATUS, AUDIT_ACTIONS } from '@pg-system/shared';

/** 자동 실행 배치 결과 */
export interface AutoExecutionResult {
  /** 처리 성공 건수 */
  processed: number;
  /** 처리 실패 건수 */
  failed: number;
  /** 실패 에러 메시지 목록 */
  errors: string[];
}

/** 시스템 자동 처리 시 감사 로그에 기록되는 운영자 ID */
const OPERATOR_ID = 'SYSTEM_AUTO';

/**
 * 정산 자동 실행 서비스
 *
 * 비유: 은행 자동이체 시스템.
 * 매일 정해진 시간에 조건 충족 건을 자동으로 다음 단계로 넘긴다.
 *
 * - 03:00 CALCULATED → CONFIRMED (생성 24시간 경과)
 * - 09:00 CONFIRMED → REMITTED (은행 송금 성공 시)
 * - 15:00 REMITTED → COMPLETED (송금 24시간 경과)
 */
@Injectable()
export class SettlementAutoExecutionService {
  private readonly logger = new Logger(SettlementAutoExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly bankingApi: BankingApiService,
  ) {}

  /**
   * CALCULATED → CONFIRMED 자동 확정
   *
   * 조건: 생성 후 24시간 경과한 CALCULATED 정산
   * 비유: 계산서가 하루 동안 이의 없으면 자동 확정되는 것
   *
   * @param maxCount 한 번에 처리할 최대 건수 (기본 100)
   */
  async autoConfirmSettlements(maxCount = 100): Promise<AutoExecutionResult> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const targets = await this.prisma.settlements.findMany({
      where: {
        status: SETTLEMENT_STATUS.CALCULATED,
        created_at: { lt: cutoff },
      },
      select: { id: true, merchant_id: true, total_net: true },
      take: maxCount,
      orderBy: { created_at: 'asc' },
    });

    const result: AutoExecutionResult = { processed: 0, failed: 0, errors: [] };

    for (const settlement of targets) {
      try {
        await this.prisma.settlements.update({
          where: { id: settlement.id },
          data: {
            status: SETTLEMENT_STATUS.CONFIRMED,
            updated_by: OPERATOR_ID,
          },
        });

        this.security
          .writeAuditLog({
            action: AUDIT_ACTIONS.SETTLEMENT_CONFIRMED,
            resourceType: 'settlements',
            resourceId: settlement.id,
            detail: {
              merchantId: settlement.merchant_id,
              netAmount: Number(settlement.total_net),
              operator: OPERATOR_ID,
              method: 'auto',
            },
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`감사 로그 기록 실패 (무시) — ${msg}`);
          });

        result.processed++;
      } catch (err: unknown) {
        result.failed++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`[${settlement.id}] ${msg}`);
        this.logger.error(`autoConfirm 실패 — id=${settlement.id} error=${msg}`);
      }
    }

    return result;
  }

  /**
   * CONFIRMED → REMITTED 자동 송금
   *
   * 조건: CONFIRMED 상태 + 가맹점 은행 정보 존재
   * 동작: BankingApiService로 송금 → 성공 시 REMITTED 전환
   * 비유: 확정된 정산금을 가맹점 통장에 자동 입금
   *
   * @param maxCount 한 번에 처리할 최대 건수 (기본 100)
   */
  async autoRemitSettlements(maxCount = 100): Promise<AutoExecutionResult> {
    const targets = await this.prisma.settlements.findMany({
      where: {
        status: SETTLEMENT_STATUS.CONFIRMED,
      },
      select: {
        id: true,
        merchant_id: true,
        total_net: true,
        merchants: {
          select: {
            bank_name: true,
            bank_account: true,
            bank_holder: true,
          },
        },
      },
      take: maxCount,
      orderBy: { created_at: 'asc' },
    });

    const result: AutoExecutionResult = { processed: 0, failed: 0, errors: [] };

    for (const settlement of targets) {
      try {
        const merchant = settlement.merchants;

        // 은행 정보 미등록 시 스킵
        if (!merchant.bank_name || !merchant.bank_account) {
          result.failed++;
          result.errors.push(
            `[${settlement.id}] 가맹점 은행 정보 미등록 (merchant=${settlement.merchant_id})`,
          );
          this.logger.warn(
            `autoRemit 스킵 — id=${settlement.id} 은행 정보 미등록`,
          );
          continue;
        }

        // 은행 송금 요청 (현재: 스텁)
        const transferResult = await this.bankingApi.transfer({
          bankCode: merchant.bank_name,
          accountNumber: merchant.bank_account,
          amount: settlement.total_net,
          reference: settlement.id,
          ...(merchant.bank_holder != null && { accountHolder: merchant.bank_holder }),
        });

        if (!transferResult.success) {
          result.failed++;
          result.errors.push(
            `[${settlement.id}] 송금 실패 — ${transferResult.errorMessage ?? 'Unknown'}`,
          );
          this.logger.error(
            `autoRemit 송금 실패 — id=${settlement.id} error=${transferResult.errorMessage}`,
          );
          continue;
        }

        // REMITTED로 전환
        await this.prisma.settlements.update({
          where: { id: settlement.id },
          data: {
            status: SETTLEMENT_STATUS.REMITTED,
            remitted_at: new Date(),
            updated_by: OPERATOR_ID,
          },
        });

        this.security
          .writeAuditLog({
            action: AUDIT_ACTIONS.SETTLEMENT_REMITTED,
            resourceType: 'settlements',
            resourceId: settlement.id,
            detail: {
              merchantId: settlement.merchant_id,
              netAmount: Number(settlement.total_net),
              bankReferenceId: transferResult.referenceId,
              operator: OPERATOR_ID,
              method: 'auto',
            },
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`감사 로그 기록 실패 (무시) — ${msg}`);
          });

        result.processed++;
      } catch (err: unknown) {
        result.failed++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`[${settlement.id}] ${msg}`);
        this.logger.error(`autoRemit 실패 — id=${settlement.id} error=${msg}`);
      }
    }

    return result;
  }

  /**
   * REMITTED → COMPLETED 자동 완료
   *
   * 조건: 송금(remitted_at) 후 24시간 경과
   * 비유: 입금 확인 후 하루가 지나면 정산 완료 처리
   *
   * @param maxCount 한 번에 처리할 최대 건수 (기본 100)
   */
  async autoCompleteSettlements(maxCount = 100): Promise<AutoExecutionResult> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const targets = await this.prisma.settlements.findMany({
      where: {
        status: SETTLEMENT_STATUS.REMITTED,
        remitted_at: { lt: cutoff },
      },
      select: { id: true, merchant_id: true, total_net: true },
      take: maxCount,
      orderBy: { remitted_at: 'asc' },
    });

    const result: AutoExecutionResult = { processed: 0, failed: 0, errors: [] };

    for (const settlement of targets) {
      try {
        await this.prisma.settlements.update({
          where: { id: settlement.id },
          data: {
            status: SETTLEMENT_STATUS.COMPLETED,
            updated_by: OPERATOR_ID,
          },
        });

        this.security
          .writeAuditLog({
            action: AUDIT_ACTIONS.SETTLEMENT_COMPLETED,
            resourceType: 'settlements',
            resourceId: settlement.id,
            detail: {
              merchantId: settlement.merchant_id,
              netAmount: Number(settlement.total_net),
              operator: OPERATOR_ID,
              method: 'auto',
            },
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`감사 로그 기록 실패 (무시) — ${msg}`);
          });

        result.processed++;
      } catch (err: unknown) {
        result.failed++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`[${settlement.id}] ${msg}`);
        this.logger.error(
          `autoComplete 실패 — id=${settlement.id} error=${msg}`,
        );
      }
    }

    return result;
  }
}
