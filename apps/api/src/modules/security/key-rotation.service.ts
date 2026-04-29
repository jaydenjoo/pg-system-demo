// ============================================================
// Security — 암호화 키 로테이션 서비스 (PCI DSS 3.6.1)
// ============================================================
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from './security.service';
import { KmsService, KMS_SERVICE } from './kms/kms.interface';
import { AUDIT_ACTIONS } from '@pg-system/shared';

export interface KeyRotationResult {
  keyAlias: string;
  oldKeyId: string;
  newKeyId: string;
  rotatedAt: Date;
}

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
    @Inject(KMS_SERVICE) private readonly kmsService: KmsService,
  ) {}

  /**
   * 특정 키 별칭(alias)의 로테이션 실행.
   * 1. encryption_key_metadata에서 ACTIVE 키 조회
   * 2. KmsService.rotateKey() 호출하여 새 키 생성
   * 3. DB 메타데이터 업데이트 (last_rotated_at, next_rotation_at)
   * 4. 감사 로그 기록
   */
  async rotateKey(keyAlias: string): Promise<KeyRotationResult> {
    // 감사 로그: 시작 (fire-and-forget)
    void this.securityService
      .writeAuditLog({
        action: AUDIT_ACTIONS.KEY_ROTATION_START,
        resourceType: 'ENCRYPTION_KEY',
        resourceId: keyAlias,
        detail: { keyAlias },
      })
      .catch((err: unknown) => {
        this.logger.error(`키 로테이션 시작 감사 로그 실패: ${String(err)}`);
      });

    const keyMeta = await this.prisma.encryption_key_metadata.findUnique({
      where: { key_alias: keyAlias },
    });

    if (!keyMeta || keyMeta.status !== 'ACTIVE') {
      // 감사 로그: 실패 (fire-and-forget)
      void this.securityService
        .writeAuditLog({
          action: AUDIT_ACTIONS.KEY_ROTATION_FAILED,
          resourceType: 'ENCRYPTION_KEY',
          resourceId: keyAlias,
          detail: { reason: '활성 키를 찾을 수 없음', keyAlias },
        })
        .catch((err: unknown) => {
          this.logger.error(`키 로테이션 실패 감사 로그 실패: ${String(err)}`);
        });
      throw new Error(`활성 키를 찾을 수 없습니다: ${keyAlias}`);
    }

    // status를 ROTATING으로 변경 (동시 로테이션 방지)
    await this.prisma.encryption_key_metadata.update({
      where: { key_alias: keyAlias },
      data: { status: 'ROTATING' },
    });

    try {
      const newKeyId = await this.kmsService.rotateKey(keyMeta.id);
      const now = new Date();
      const nextRotation = new Date(now);
      nextRotation.setDate(nextRotation.getDate() + keyMeta.rotation_period_days);

      await this.prisma.encryption_key_metadata.update({
        where: { key_alias: keyAlias },
        data: {
          status: 'ACTIVE',
          last_rotated_at: now,
          next_rotation_at: nextRotation,
        },
      });

      const result: KeyRotationResult = {
        keyAlias,
        oldKeyId: keyMeta.id,
        newKeyId,
        rotatedAt: now,
      };

      // 감사 로그: 완료 (fire-and-forget)
      void this.securityService
        .writeAuditLog({
          action: AUDIT_ACTIONS.KEY_ROTATION_COMPLETE,
          resourceType: 'ENCRYPTION_KEY',
          resourceId: keyAlias,
          detail: { keyAlias, newKeyId, rotatedAt: now.toISOString() },
        })
        .catch((err: unknown) => {
          this.logger.error(`키 로테이션 완료 감사 로그 실패: ${String(err)}`);
        });

      this.logger.log(`키 로테이션 완료: ${keyAlias}`);
      return result;
    } catch (error: unknown) {
      // 실패 시 ACTIVE로 복구
      await this.prisma.encryption_key_metadata.update({
        where: { key_alias: keyAlias },
        data: { status: 'ACTIVE' },
      });

      void this.securityService
        .writeAuditLog({
          action: AUDIT_ACTIONS.KEY_ROTATION_FAILED,
          resourceType: 'ENCRYPTION_KEY',
          resourceId: keyAlias,
          detail: { reason: String(error), keyAlias },
        })
        .catch((err: unknown) => {
          this.logger.error(`키 로테이션 실패 감사 로그 실패: ${String(err)}`);
        });

      throw error;
    }
  }

  /**
   * 로테이션 기한이 지난 키들을 일괄 조회.
   */
  async findKeysNeedingRotation(): Promise<string[]> {
    const now = new Date();
    const keys = await this.prisma.encryption_key_metadata.findMany({
      where: {
        status: 'ACTIVE',
        next_rotation_at: { lte: now },
      },
      select: { key_alias: true },
    });
    return keys.map((k) => k.key_alias);
  }
}
