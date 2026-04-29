// ============================================================
// Security — 파일 무결성 모니터 스케줄러 단위 테스트 (PCI DSS 11.6.1)
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { IntegrityMonitorScheduler } from '../integrity-monitor.scheduler';
import { IntegrityMonitorService } from '../integrity-monitor.service';
import { NotificationsService } from '../../notifications/notifications.service';

// ---- Mocks ----
const mockIntegrityMonitorService = {
  checkIntegrity: jest.fn(),
};

const mockNotificationsService = {
  send: jest.fn().mockResolvedValue(undefined),
};

describe('IntegrityMonitorScheduler', () => {
  let scheduler: IntegrityMonitorScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrityMonitorScheduler,
        { provide: IntegrityMonitorService, useValue: mockIntegrityMonitorService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    scheduler = module.get<IntegrityMonitorScheduler>(IntegrityMonitorScheduler);
    jest.clearAllMocks();
    mockNotificationsService.send.mockResolvedValue(undefined);
  });

  describe('handleIntegrityCheck', () => {
    it('FIM 검사 통과 시 로그만 기록하고 알림을 발송하지 않는다', async () => {
      const checkedAt = new Date();
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'PASS',
        totalFiles: 150,
        changedFiles: [],
        newFiles: [],
        deletedFiles: [],
        checkedAt,
      });

      await scheduler.handleIntegrityCheck();

      expect(mockIntegrityMonitorService.checkIntegrity).toHaveBeenCalled();
      // PASS 상태에서는 알림 발송 안 함
      expect(mockNotificationsService.send).not.toHaveBeenCalled();
    });

    it('FIM 검사 실패 시(변경/신규/삭제 파일 감지) CRITICAL 알림을 발송한다', async () => {
      const checkedAt = new Date();
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'FAIL',
        totalFiles: 150,
        changedFiles: ['file1.js', 'file2.ts'],
        newFiles: ['new-file.js'],
        deletedFiles: [],
        checkedAt,
      });

      await scheduler.handleIntegrityCheck();

      // fire-and-forget 비동기 완료 대기
      await new Promise(process.nextTick);

      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'FIM 파일 무결성 검사 실패',
          severity: 'CRITICAL',
          message: expect.stringMatching(/변경 2개.*신규 1개.*삭제 0개/),
          metadata: expect.objectContaining({
            changedFiles: 2,
            newFiles: 1,
            deletedFiles: 0,
            checkedAt,
          }),
        }),
      );
    });

    it('FIM 검사 실패 알림 발송 실패 시에도 오류를 로그하고 scheduler는 정상 종료한다', async () => {
      const checkedAt = new Date();
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'FAIL',
        totalFiles: 150,
        changedFiles: ['changed.js'],
        newFiles: [],
        deletedFiles: [],
        checkedAt,
      });

      const notificationError = new Error('notification service failed');
      mockNotificationsService.send.mockRejectedValue(notificationError);

      // handleIntegrityCheck는 알림 발송 실패를 catch하고 계속 진행
      await scheduler.handleIntegrityCheck();

      // fire-and-forget 비동기 완료 대기
      await new Promise(process.nextTick);

      expect(mockNotificationsService.send).toHaveBeenCalled();
      // 에러가 있어도 scheduler 자체는 정상 완료
    });

    it('FIM 검사 상태가 ERROR일 때 에러 로그만 기록하고 알림을 발송하지 않는다', async () => {
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'ERROR',
        totalFiles: 0,
        changedFiles: [],
        newFiles: [],
        deletedFiles: [],
        checkedAt: new Date(),
      });

      await scheduler.handleIntegrityCheck();

      // ERROR 상태에서는 알림 발송 안 함 (에러 로그만 기록)
      expect(mockNotificationsService.send).not.toHaveBeenCalled();
    });

    it('checkIntegrity 호출 중 예외 발생 시 오류를 로그하고 scheduler는 정상 종료한다', async () => {
      const checkError = new Error('FIM check failed unexpectedly');
      mockIntegrityMonitorService.checkIntegrity.mockRejectedValue(checkError);

      // scheduler의 handleIntegrityCheck는 예외를 처리하지 않으므로, NestJS @Cron이 로그함
      // 여기서는 예외가 발생하는지 확인
      await expect(scheduler.handleIntegrityCheck()).rejects.toThrow('FIM check failed unexpectedly');
    });

    it('다수의 파일 변경 감지 시 정확한 카운트로 알림을 발송한다', async () => {
      const checkedAt = new Date();
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'FAIL',
        totalFiles: 500,
        changedFiles: Array(25).fill(null).map((_, i) => `changed-${i}.js`),
        newFiles: Array(10).fill(null).map((_, i) => `new-${i}.ts`),
        deletedFiles: Array(3).fill(null).map((_, i) => `deleted-${i}.json`),
        checkedAt,
      });

      await scheduler.handleIntegrityCheck();

      await new Promise(process.nextTick);

      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'FIM 파일 무결성 검사 실패',
          message: expect.stringMatching(/변경 25개.*신규 10개.*삭제 3개/),
          metadata: expect.objectContaining({
            changedFiles: 25,
            newFiles: 10,
            deletedFiles: 3,
          }),
        }),
      );
    });

    it('PASS 상태일 때도 checkIntegrity를 매번 호출한다', async () => {
      mockIntegrityMonitorService.checkIntegrity.mockResolvedValue({
        status: 'PASS',
        totalFiles: 150,
        changedFiles: [],
        newFiles: [],
        deletedFiles: [],
        checkedAt: new Date(),
      });

      // 첫 호출
      await scheduler.handleIntegrityCheck();
      expect(mockIntegrityMonitorService.checkIntegrity).toHaveBeenCalledTimes(1);

      // 두 번째 호출
      await scheduler.handleIntegrityCheck();
      expect(mockIntegrityMonitorService.checkIntegrity).toHaveBeenCalledTimes(2);
    });
  });
});
