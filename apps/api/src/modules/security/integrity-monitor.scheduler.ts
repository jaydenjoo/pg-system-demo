import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrityMonitorService } from './integrity-monitor.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class IntegrityMonitorScheduler {
  private readonly logger = new Logger(IntegrityMonitorScheduler.name);

  constructor(
    private readonly integrityMonitor: IntegrityMonitorService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** 매시간 파일 무결성 검사 실행 (PCI DSS 11.6.1) */
  @Cron(CronExpression.EVERY_HOUR)
  async handleIntegrityCheck(): Promise<void> {
    this.logger.log('FIM 정기 무결성 검사 시작');

    const result = await this.integrityMonitor.checkIntegrity();

    if (result.status === 'PASS') {
      this.logger.log(`FIM 검사 통과: ${result.totalFiles}개 파일 정상`);
    } else if (result.status === 'FAIL') {
      this.logger.warn(
        `FIM 검사 실패: 변경 ${result.changedFiles.length}개, ` +
        `신규 ${result.newFiles.length}개, ` +
        `삭제 ${result.deletedFiles.length}개`,
      );
      void this.notifications?.send({
        title: 'FIM 파일 무결성 검사 실패',
        message:
          `변경 ${result.changedFiles.length}개, ` +
          `신규 ${result.newFiles.length}개, ` +
          `삭제 ${result.deletedFiles.length}개 탐지됨`,
        severity: 'CRITICAL',
        timestamp: new Date(),
        metadata: {
          changedFiles: result.changedFiles.length,
          newFiles: result.newFiles.length,
          deletedFiles: result.deletedFiles.length,
          checkedAt: result.checkedAt,
        },
      }).catch((err: unknown) => {
        this.logger.error(`FIM 알림 발송 실패: ${String(err)}`);
      });
    } else {
      this.logger.error('FIM 검사 오류 발생');
    }
  }
}
