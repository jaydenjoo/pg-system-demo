// ============================================================
// PG Gateway — 웹훅 재시도 스케줄러 (setInterval 기반)
// ============================================================

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';

/** 재시도 폴링 주기 (밀리초) — 30초 */
const RETRY_POLL_INTERVAL_MS = 30_000;

@Injectable()
export class WebhookRetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookRetryService.name);
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  /** M-2: 동시 실행 방지 플래그 */
  private isProcessing = false;

  constructor(private readonly webhookService: WebhookService) {}

  onModuleInit(): void {
    this.intervalRef = setInterval(() => {
      void this.tick();
    }, RETRY_POLL_INTERVAL_MS);
    this.logger.log(
      `[WebhookRetry] 재시도 스케줄러 시작 — 간격=${RETRY_POLL_INTERVAL_MS / 1000}초`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    this.logger.log('[WebhookRetry] 재시도 스케줄러 종료');
  }

  private async tick(): Promise<void> {
    // M-2: 이전 tick이 아직 실행 중이면 skip
    if (this.isProcessing) {
      this.logger.debug('[WebhookRetry] 이전 작업 진행 중 — skip');
      return;
    }

    this.isProcessing = true;
    try {
      const result = await this.webhookService.retryPending();
      if (result.processed > 0) {
        this.logger.log(
          `[WebhookRetry] 처리=${result.processed} 성공=${result.succeeded} 실패=${result.failed}`,
        );
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[WebhookRetry] 스케줄러 에러 — ${msg}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
