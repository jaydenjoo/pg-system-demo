// ============================================================
// Security — 키 로테이션 스케줄러 단위 테스트
// ============================================================
import { Test, TestingModule } from '@nestjs/testing';
import { KeyRotationScheduler } from '../key-rotation.scheduler';
import { KeyRotationService } from '../key-rotation.service';
import { NotificationsService } from '../../notifications/notifications.service';

// ---- Mocks ----
const mockKeyRotationService = {
  findKeysNeedingRotation: jest.fn(),
  rotateKey: jest.fn(),
};

const mockNotificationsService = {
  send: jest.fn().mockResolvedValue(undefined),
};

describe('KeyRotationScheduler', () => {
  let scheduler: KeyRotationScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyRotationScheduler,
        { provide: KeyRotationService, useValue: mockKeyRotationService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    scheduler = module.get<KeyRotationScheduler>(KeyRotationScheduler);
    jest.clearAllMocks();
    mockNotificationsService.send.mockResolvedValue(undefined);
  });

  describe('handleKeyRotationCheck', () => {
    it('로테이션 필요한 키가 없으면 rotateKey를 호출하지 않는다', async () => {
      mockKeyRotationService.findKeysNeedingRotation.mockResolvedValue([]);

      await scheduler.handleKeyRotationCheck();

      expect(mockKeyRotationService.rotateKey).not.toHaveBeenCalled();
    });

    it('로테이션 필요한 키가 있으면 각 키를 순서대로 로테이션한다', async () => {
      mockKeyRotationService.findKeysNeedingRotation.mockResolvedValue([
        'key-alias-1',
        'key-alias-2',
      ]);
      mockKeyRotationService.rotateKey.mockResolvedValue({
        keyAlias: 'key-alias-1',
        oldKeyId: 'old-uuid',
        newKeyId: 'new-uuid',
        rotatedAt: new Date(),
      });

      await scheduler.handleKeyRotationCheck();

      expect(mockKeyRotationService.rotateKey).toHaveBeenCalledTimes(2);
      expect(mockKeyRotationService.rotateKey).toHaveBeenCalledWith('key-alias-1');
      expect(mockKeyRotationService.rotateKey).toHaveBeenCalledWith('key-alias-2');
    });

    it('로테이션 실패 시 알림을 전송하고 다음 키로 계속 진행한다', async () => {
      mockKeyRotationService.findKeysNeedingRotation.mockResolvedValue(['failing-key']);
      mockKeyRotationService.rotateKey.mockRejectedValue(new Error('rotation failed'));

      await scheduler.handleKeyRotationCheck();

      // 에러가 있어도 전체 흐름이 중단되지 않음
      expect(mockKeyRotationService.rotateKey).toHaveBeenCalledWith('failing-key');

      // fire-and-forget 비동기 완료 대기
      await new Promise(process.nextTick);

      expect(mockNotificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '암호화 키 로테이션 실패',
          severity: 'CRITICAL',
          metadata: expect.objectContaining({ keyAlias: 'failing-key' }),
        }),
      );
    });
  });
});
