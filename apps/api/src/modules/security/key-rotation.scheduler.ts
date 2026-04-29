// ============================================================
// Security — 키 로테이션 스케줄러 (PCI DSS 3.6.1)
// 매일 자정 실행 → next_rotation_at이 지난 키 자동 로테이션
// ============================================================
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KeyRotationService } from './key-rotation.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class KeyRotationScheduler {
  private readonly logger = new Logger(KeyRotationScheduler.name);

  constructor(
    private readonly keyRotationService: KeyRotationService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** 매일 자정에 키 로테이션 체크 */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleKeyRotationCheck(): Promise<void> {
    this.logger.log('키 로테이션 정기 점검 시작');

    const aliases = await this.keyRotationService.findKeysNeedingRotation();

    if (aliases.length === 0) {
      this.logger.log('로테이션 필요한 키 없음');
      return;
    }

    this.logger.log(`로테이션 대상 키: ${aliases.join(', ')}`);

    for (const alias of aliases) {
      try {
        await this.keyRotationService.rotateKey(alias);
        this.logger.log(`키 로테이션 성공: ${alias}`);
      } catch (error: unknown) {
        this.logger.error(`키 로테이션 실패: ${alias} — ${String(error)}`);
        void this.notifications
          ?.send({
            title: '암호화 키 로테이션 실패',
            message: `키 ${alias} 로테이션 실패: ${String(error)}`,
            severity: 'CRITICAL',
            timestamp: new Date(),
            metadata: { keyAlias: alias, error: String(error) },
          })
          .catch((err: unknown) => {
            this.logger.error(`키 로테이션 실패 알림 발송 실패: ${String(err)}`);
          });
      }
    }
  }
}
