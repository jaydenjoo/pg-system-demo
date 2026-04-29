// ============================================================
// 정산 배치 BullMQ 프로세서
// 스케줄러가 큐에 등록한 Job을 비동기 워커로 처리
// 메인 스레드 블로킹 없이 정산 배치 실행
// ============================================================

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SettlementAutoExecutionService } from './settlement-auto-execution.service';
import type { AutoExecutionResult } from './settlement-auto-execution.service';

/** 정산 큐 이름 */
export const SETTLEMENT_QUEUE = 'settlement';

/** Job 유형 */
export type SettlementJobType = 'auto-confirm' | 'auto-remit' | 'auto-complete';

/** Job 데이터 */
export interface SettlementJobData {
  type: SettlementJobType;
  maxCount?: number;
}

/**
 * 정산 배치 워커 — BullMQ 큐에서 Job을 꺼내 처리.
 *
 * 비유: 편의점 택배 분류 로봇.
 * 스케줄러(택배 접수)가 "이거 처리해줘" 하면,
 * 프로세서(분류 로봇)가 별도 라인에서 하나씩 처리.
 * 접수 창구는 바로 다음 손님 받을 수 있음 (비블로킹).
 */
@Processor(SETTLEMENT_QUEUE)
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);

  constructor(
    private readonly autoExecution: SettlementAutoExecutionService,
  ) {
    super();
  }

  async process(job: Job<SettlementJobData>): Promise<AutoExecutionResult> {
    const { type, maxCount } = job.data;
    this.logger.log(`[SettlementProcessor] Job 시작 — type=${type} id=${job.id}`);

    let result: AutoExecutionResult;

    switch (type) {
      case 'auto-confirm':
        result = await this.autoExecution.autoConfirmSettlements(maxCount);
        break;
      case 'auto-remit':
        result = await this.autoExecution.autoRemitSettlements(maxCount);
        break;
      case 'auto-complete':
        result = await this.autoExecution.autoCompleteSettlements(maxCount);
        break;
      default: {
        const exhaustive: never = type;
        throw new Error(`Unknown settlement job type: ${String(exhaustive)}`);
      }
    }

    this.logger.log(
      `[SettlementProcessor] Job 완료 — type=${type} processed=${result.processed} failed=${result.failed}`,
    );

    return result;
  }
}
