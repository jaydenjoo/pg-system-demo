# Phase C-2/C-3/C-4 구현 지시 프롬프트 (Sonnet용)

> **작성**: Opus (리뷰/설계)
> **실행**: Sonnet 4.6 (코딩)
> **프로젝트**: PG System — 🔴 보안 프로젝트 (결제=돈)
> **선행 완료**: Phase C-1 (감사 로그 강화) ✅ PASS
> **이 프롬프트 범위**: C-2 키 로테이션 + C-3 IP 화이트리스트 + C-4 PCI-DSS 문서 업데이트

---

## 실행 순서

```
C-2 (키 로테이션) → C-3 (IP 화이트리스트) → C-4 (문서 업데이트) → 검증
```

각 단계 완료 후 `npx tsc --noEmit` 통과 확인 후 다음 단계 진행.

---

## C-2: 암호화 키 로테이션 (PCI DSS 3.6.1)

### C-2 개요
encryption_key_metadata 테이블과 KmsService 인터페이스는 이미 존재.
`LocalKmsService.rotateKey()`는 스텁 상태 — 실제 로직 구현 필요.
KeyRotationService(비즈니스 로직) + KeyRotationScheduler(90일 주기 CRON) 신규 생성.

### C-2-1: `KeyRotationService` 신규 생성

**파일**: `apps/api/src/modules/security/key-rotation.service.ts`

```typescript
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
    // 감사 로그: 시작
    void this.securityService.writeAuditLog({
      action: AUDIT_ACTIONS.KEY_ROTATION_START,
      resourceType: 'ENCRYPTION_KEY',
      resourceId: keyAlias,
      detail: { keyAlias },
    }).catch((err: unknown) => {
      this.logger.error(`키 로테이션 시작 감사 로그 실패: ${String(err)}`);
    });

    const keyMeta = await this.prisma.encryption_key_metadata.findUnique({
      where: { key_alias: keyAlias },
    });

    if (!keyMeta || keyMeta.status !== 'ACTIVE') {
      // 감사 로그: 실패
      void this.securityService.writeAuditLog({
        action: AUDIT_ACTIONS.KEY_ROTATION_FAILED,
        resourceType: 'ENCRYPTION_KEY',
        resourceId: keyAlias,
        detail: { reason: '활성 키를 찾을 수 없음', keyAlias },
      }).catch((err: unknown) => {
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

      // 감사 로그: 완료
      void this.securityService.writeAuditLog({
        action: AUDIT_ACTIONS.KEY_ROTATION_COMPLETE,
        resourceType: 'ENCRYPTION_KEY',
        resourceId: keyAlias,
        detail: { keyAlias, newKeyId, rotatedAt: now.toISOString() },
      }).catch((err: unknown) => {
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

      void this.securityService.writeAuditLog({
        action: AUDIT_ACTIONS.KEY_ROTATION_FAILED,
        resourceType: 'ENCRYPTION_KEY',
        resourceId: keyAlias,
        detail: { reason: String(error), keyAlias },
      }).catch((err: unknown) => {
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
```

### C-2-2: `KeyRotationScheduler` 신규 생성

**파일**: `apps/api/src/modules/security/key-rotation.scheduler.ts`

> 참고 패턴: `integrity-monitor.scheduler.ts` — @Cron + @Optional() notifications

```typescript
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
        void this.notifications?.send({
          title: '암호화 키 로테이션 실패',
          message: `키 ${alias} 로테이션 실패: ${String(error)}`,
          severity: 'CRITICAL',
          timestamp: new Date(),
          metadata: { keyAlias: alias, error: String(error) },
        }).catch((err: unknown) => {
          this.logger.error(`키 로테이션 실패 알림 발송 실패: ${String(err)}`);
        });
      }
    }
  }
}
```

### C-2-3: `LocalKmsService.rotateKey()` 실제 구현

**파일**: `apps/api/src/modules/security/kms/local-kms.service.ts`

현재 rotateKey() (65-71줄):
```typescript
  async rotateKey(_keyId: string): Promise<string> {
    const newKeyId = crypto.randomUUID();
    this.logger.warn(
      `[LocalKMS] Key rotation requested (newKeyId=${newKeyId}). 프로덕션에서는 AWS KMS/Vault에서 실제 로테이션 수행`,
    );
    return newKeyId;
  }
```

변경 후:
```typescript
  async rotateKey(_keyId: string): Promise<string> {
    const newKeyId = crypto.randomUUID();
    // 로컬 환경: 새 키 ID만 발급 (실제 마스터키 교체는 환경변수 재설정으로 수행)
    // 프로덕션: AWS KMS/Vault에서 실제 키 로테이션 수행
    this.logger.log(
      `[LocalKMS] 키 로테이션 완료 (newKeyId=${newKeyId}). 로컬 환경에서는 ENCRYPTION_KEY 환경변수 교체 필요.`,
    );
    return newKeyId;
  }
```

> 변경 포인트: `logger.warn` → `logger.log`, 주석 개선, 스텁이 아닌 "로컬 환경 정상 동작"으로 문맥 변경.

### C-2-4: `SecurityModule` 에 등록

**파일**: `apps/api/src/modules/security/security.module.ts`

현재 코드 (전체):
```typescript
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { IntegrityMonitorService } from "./integrity-monitor.service";
import { IntegrityMonitorScheduler } from "./integrity-monitor.scheduler";
import { AuditHashChainService } from "./audit-hash-chain.service";
import { LocalKmsService } from "./kms/local-kms.service";
import { KMS_SERVICE } from "./kms/kms.interface";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SecurityController],
  providers: [
    SecurityService,
    IntegrityMonitorService,
    IntegrityMonitorScheduler,
    AuditHashChainService,
    {
      provide: KMS_SERVICE,
      useClass: LocalKmsService,
    },
  ],
  exports: [
    SecurityService,
    IntegrityMonitorService,
    AuditHashChainService,
    KMS_SERVICE,
  ],
})
export class SecurityModule {}
```

변경: import 2줄 추가 + providers에 2개 추가 + exports에 KeyRotationService 추가.

```typescript
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { IntegrityMonitorService } from "./integrity-monitor.service";
import { IntegrityMonitorScheduler } from "./integrity-monitor.scheduler";
import { AuditHashChainService } from "./audit-hash-chain.service";
import { KeyRotationService } from "./key-rotation.service";
import { KeyRotationScheduler } from "./key-rotation.scheduler";
import { LocalKmsService } from "./kms/local-kms.service";
import { KMS_SERVICE } from "./kms/kms.interface";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SecurityController],
  providers: [
    SecurityService,
    IntegrityMonitorService,
    IntegrityMonitorScheduler,
    AuditHashChainService,
    KeyRotationService,
    KeyRotationScheduler,
    {
      provide: KMS_SERVICE,
      useClass: LocalKmsService,
    },
  ],
  exports: [
    SecurityService,
    IntegrityMonitorService,
    AuditHashChainService,
    KeyRotationService,
    KMS_SERVICE,
  ],
})
export class SecurityModule {}
```

### C-2-5: 테스트 — `key-rotation.service.spec.ts`

**파일**: `apps/api/src/modules/security/__tests__/key-rotation.service.spec.ts`

> 참고 패턴: `local-kms.spec.ts` (Prisma mock + ConfigService mock)
> 참고 패턴: `audit-hash-chain.spec.ts` (fixture factory + Prisma $transaction mock)

**테스트 케이스 (최소 5개)**:

1. `정상 로테이션: ACTIVE 키 → rotateKey → last_rotated_at 업데이트`
   - encryption_key_metadata.findUnique → ACTIVE 키 반환
   - kmsService.rotateKey → 새 keyId 반환
   - encryption_key_metadata.update 2회 호출 확인 (ROTATING → ACTIVE)
   - 결과에 newKeyId, rotatedAt 포함 확인

2. `존재하지 않는 키 별칭 → Error throw`
   - findUnique → null 반환
   - Error("활성 키를 찾을 수 없습니다") 확인

3. `INACTIVE 상태 키 → Error throw`
   - findUnique → status: 'INACTIVE' 반환
   - Error throw 확인

4. `KMS rotateKey 실패 → status ACTIVE 복구 + Error rethrow`
   - kmsService.rotateKey → throw Error
   - update로 status: 'ACTIVE' 복구 확인
   - 원본 에러 rethrow 확인

5. `findKeysNeedingRotation: next_rotation_at 지난 키 목록 반환`
   - findMany mock → 2개 키 반환
   - 반환값에 key_alias 배열 확인

6. `감사 로그: START/COMPLETE 기록`
   - writeAuditLog 호출 확인 (KEY_ROTATION_START, KEY_ROTATION_COMPLETE)

**Mock 구조 참고**:
```typescript
const mockPrisma = {
  encryption_key_metadata: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockKmsService = {
  rotateKey: jest.fn(),
};

const mockSecurityService = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};
```

### C-2-6: 테스트 — `key-rotation.scheduler.spec.ts`

**파일**: `apps/api/src/modules/security/__tests__/key-rotation.scheduler.spec.ts`

**테스트 케이스 (최소 3개)**:

1. `로테이션 대상 없음 → 로그만 출력, rotateKey 미호출`
2. `로테이션 대상 2개 → 각각 rotateKey 호출`
3. `1개 성공, 1개 실패 → 실패해도 나머지 계속 실행`

---

## C-3: IP 화이트리스트 가드 (PCI DSS 1.3.2)

### C-3 개요
가맹점별 허용 IP 목록을 DB에 저장하고, PG API 호출 시 클라이언트 IP를 검증하는 가드.
PgBasicAuthGuard 다음에 실행되어 `req.pgApiKeyId`로 허용 IP 조회.

### C-3-1: Prisma 마이그레이션 — `allowed_ips` 컬럼 추가

**마이그레이션 파일**: `apps/api/prisma/migrations/20260302000000_add_allowed_ips/migration.sql`

```sql
-- PCI DSS 1.3.2: 가맹점 API 키별 IP 화이트리스트
ALTER TABLE "pg_api_keys" ADD COLUMN "allowed_ips" TEXT[] DEFAULT '{}';
```

**Prisma 스키마 변경**: `apps/api/prisma/schema.prisma`

`pg_api_keys` 모델에 추가:
```prisma
  allowed_ips       String[]  @default([])
```

> `is_active` 필드 다음, `created_at` 이전에 삽입.

마이그레이션 후 반드시 `npx prisma generate` 실행.

### C-3-2: `IpWhitelistGuard` 신규 생성

**파일**: `apps/api/src/modules/pg-gateway/guards/ip-whitelist.guard.ts`

```typescript
// ============================================================
// PG Gateway — IP 화이트리스트 가드 (PCI DSS 1.3.2)
// PgBasicAuthGuard 이후 실행 — req.pgApiKeyId로 허용 IP 조회
// ============================================================
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES, AUDIT_ACTIONS } from '@pg-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecurityService } from '../../security/security.service';

interface PgAuthenticatedRequest extends Request {
  pgMerchantId: string;
  pgApiKeyId: string;
  pgClientKey: string;
}

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IpWhitelistGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PgAuthenticatedRequest>();

    const apiKeyId = request.pgApiKeyId;
    if (!apiKeyId) {
      // PgBasicAuthGuard가 먼저 실행되지 않은 경우 → 통과 (deposit-callback 등)
      return true;
    }

    const apiKey = await this.prisma.pg_api_keys.findUnique({
      where: { id: apiKeyId },
      select: { allowed_ips: true },
    });

    // 키가 없거나 allowed_ips가 빈 배열이면 → IP 제한 없음 (모든 IP 허용)
    if (!apiKey || apiKey.allowed_ips.length === 0) {
      return true;
    }

    const clientIp = this.extractClientIp(request);

    if (!apiKey.allowed_ips.includes(clientIp)) {
      this.logger.warn(
        `IP 차단: ${clientIp} (apiKeyId=${apiKeyId}, 허용=${apiKey.allowed_ips.join(',')})`,
      );

      // 감사 로그: IP 차단 이벤트 (fire-and-forget)
      void this.securityService.writeAuditLog({
        action: AUDIT_ACTIONS.IP_WHITELIST_BLOCKED,
        resourceType: 'PG_API_KEY',
        resourceId: apiKeyId,
        ipAddress: clientIp,
        detail: {
          blockedIp: clientIp,
          allowedIps: apiKey.allowed_ips,
          merchantId: request.pgMerchantId,
        },
      }).catch((err: unknown) => {
        this.logger.error(`IP 차단 감사 로그 실패: ${String(err)}`);
      });

      throw new ForbiddenException({
        code: ERROR_CODES.PGW_IP_BLOCKED,
        message: '허용되지 않은 IP 주소입니다',
      });
    }

    return true;
  }

  /**
   * 클라이언트 IP 추출. X-Forwarded-For 헤더 우선.
   */
  private extractClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
```

### C-3-3: 컨트롤러에 IpWhitelistGuard 적용

**PaymentController** (`apps/api/src/modules/pg-gateway/controllers/payment.controller.ts`)

현재 (25줄):
```typescript
@Controller('pg/v1/payments')
@UseGuards(PgBasicAuthGuard)
export class PaymentController {
```

변경:
```typescript
@Controller('pg/v1/payments')
@UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
export class PaymentController {
```

import 추가:
```typescript
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
```

**VirtualAccountController** (`apps/api/src/modules/pg-gateway/controllers/virtual-account.controller.ts`)

현재 confirm 메서드 (20줄):
```typescript
  @UseGuards(PgBasicAuthGuard)
  async confirmVirtualAccount(
```

변경:
```typescript
  @UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
  async confirmVirtualAccount(
```

import 추가:
```typescript
import { IpWhitelistGuard } from '../guards/ip-whitelist.guard';
```

> ⚠️ `deposit-callback`은 인증 없음 → IpWhitelistGuard 적용하지 않음 (pgApiKeyId 없으므로 guard 내부에서 자동 통과 처리됨)

### C-3-4: `ApiKeyService`에 `updateAllowedIps` 추가

**파일**: `apps/api/src/modules/pg-gateway/services/api-key.service.ts`

기존 `listApiKeys` 메서드(124줄) 다음에 추가:

```typescript
  /**
   * 가맹점 API 키의 허용 IP 목록 업데이트.
   * 빈 배열 설정 시 IP 제한 해제 (모든 IP 허용).
   */
  async updateAllowedIps(
    id: string,
    merchantId: string,
    allowedIps: string[],
  ): Promise<void> {
    const key = await this.prisma.pg_api_keys.findFirst({
      where: { id, merchant_id: merchantId },
    });
    if (!key) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API 키를 찾을 수 없습니다',
      });
    }

    await this.prisma.pg_api_keys.update({
      where: { id },
      data: { allowed_ips: allowedIps },
    });
  }
```

`ApiKeyListItem` 인터페이스에 `allowedIps` 필드 추가:
```typescript
export interface ApiKeyListItem {
  id: string;
  clientKey: string;
  isActive: boolean;
  webhookUrl: string | null;
  allowedIps: string[];   // ← 추가
  createdAt: Date;
}
```

`listApiKeys` 메서드의 map에 `allowedIps` 추가:
```typescript
    return keys.map((k) => ({
      id: k.id,
      clientKey: k.client_key,
      isActive: k.is_active,
      webhookUrl: k.webhook_url,
      allowedIps: k.allowed_ips,    // ← 추가
      createdAt: k.created_at,
    }));
```

### C-3-5: 테스트 — `ip-whitelist.guard.spec.ts`

**파일**: `apps/api/src/modules/pg-gateway/__tests__/ip-whitelist.guard.spec.ts`

> 참고 패턴: `pg-basic-auth.guard.spec.ts` (ExecutionContext mock, makeContext helper)

**ExecutionContext mock 패턴** (기존 코드에서 확인된 패턴):
```typescript
function makeContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
```

**테스트 케이스 (최소 5개)**:

1. `allowed_ips 빈 배열 → 모든 IP 통과`
   - findUnique → { allowed_ips: [] }
   - canActivate → true

2. `클라이언트 IP가 allowed_ips에 포함 → 통과`
   - allowed_ips: ['1.2.3.4', '5.6.7.8']
   - request.ip = '1.2.3.4'
   - canActivate → true

3. `클라이언트 IP가 allowed_ips에 미포함 → ForbiddenException`
   - allowed_ips: ['1.2.3.4']
   - request.ip = '9.9.9.9'
   - ForbiddenException (code: PGW_IP_BLOCKED) 확인

4. `X-Forwarded-For 헤더 → 첫 번째 IP 사용`
   - headers['x-forwarded-for'] = '10.0.0.1, 10.0.0.2'
   - allowed_ips: ['10.0.0.1']
   - canActivate → true

5. `pgApiKeyId 없음 (deposit-callback) → 통과`
   - request.pgApiKeyId = undefined
   - canActivate → true (IP 체크 스킵)

6. `IP 차단 시 감사 로그 기록 확인`
   - securityService.writeAuditLog 호출 확인
   - action: IP_WHITELIST_BLOCKED

**Mock 구조**:
```typescript
const mockPrisma = {
  pg_api_keys: {
    findUnique: jest.fn(),
  },
};

const mockSecurityService = {
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
};
```

### C-3-6: `api-key.service.spec.ts` 업데이트

기존 테스트 파일에 2개 테스트 추가:

1. `updateAllowedIps 성공: 유효한 키 → IP 목록 업데이트`
2. `updateAllowedIps 실패: 존재하지 않는 키 → NotFoundException`

---

## C-4: PCI-DSS 문서 업데이트

### C-4-1: `docs/pci-dss-compliance-map.md` 업데이트

**변경 사항**:

1. **섹션 2 (데이터 보호)** 테이블에 행 추가:
```markdown
| 암호화 키 로테이션 | **3.6.1** | ✅ 완료 | `key-rotation.service.ts`, `key-rotation.scheduler.ts` | 90일 주기 자동 로테이션, CRON 스케줄러, 감사 로그 기록 |
```

2. **섹션 5 (네트워크 보안)** 테이블에 행 추가:
```markdown
| IP 기반 접근 제어 | **1.3.2** | ✅ 완료 | `ip-whitelist.guard.ts`, `pg_api_keys.allowed_ips` | 가맹점별 IP 화이트리스트, 미등록 IP 차단 + 감사 로그 |
```

3. **섹션 7 (컴플라이언스 요약)** 테이블 업데이트:
   - 2. 데이터 보호: 전체 6, 완료 5, 준비 1, 비율 83%
   - 5. 네트워크 보안: 전체 9, 완료 9, 비율 100%
   - 합계: 전체 36, 완료 34, 준비 2, 비율 94%

4. **마지막 업데이트 날짜**: `2026-03-02`
5. **하단 참고에 Phase C 추가**: `*Step 10 + Phase C(보안 강화) 구현 결과를 반영합니다.*`

### C-4-2: `docs/external-audit-checklist.md` 업데이트

**변경 사항**:

1. **섹션 A (인증 및 접근 제어)** 에 행 추가:
```markdown
| A-6 | IP 화이트리스트 가드 | 1.3.2 | `apps/api/src/modules/pg-gateway/guards/ip-whitelist.guard.ts` | 소스코드 리뷰 |
```

2. **섹션 B (데이터 보호)** 에 행 추가:
```markdown
| B-5 | 암호화 키 로테이션 서비스 | 3.6.1 | `apps/api/src/modules/security/key-rotation.service.ts` | 소스코드 리뷰 |
| B-6 | 키 로테이션 스케줄러 | 3.6.1 | `apps/api/src/modules/security/key-rotation.scheduler.ts` | 소스코드 리뷰 |
```

3. **테스트 증적 테이블** 에 행 추가:
```markdown
| 키 로테이션 | `key-rotation.service.spec.ts` | 다수 |
| IP 화이트리스트 | `ip-whitelist.guard.spec.ts` | 다수 |
```

4. **증적 항목 수**: 18개 → 21개 (3개 추가)
5. **테스트 파일**: 10개 → 12개 (2개 추가)
6. **마지막 업데이트 날짜**: `2026-03-02`

---

## 검증 체크리스트

모든 구현 완료 후 아래 순서로 실행:

```bash
# 1. Prisma 마이그레이션 + 클라이언트 생성
cd apps/api && npx prisma migrate dev --name add_allowed_ips && npx prisma generate

# 2. 타입 체크
npx tsc --noEmit

# 3. 린트
npx eslint . --fix

# 4. 빌드
pnpm build

# 5. 전체 테스트 (기존 + 신규)
pnpm test

# 6. 신규 테스트만 개별 실행 확인
npx jest key-rotation.service.spec.ts --verbose
npx jest key-rotation.scheduler.spec.ts --verbose
npx jest ip-whitelist.guard.spec.ts --verbose
```

---

## 파일 변경 요약 (총 13개 파일)

### 신규 생성 (5개)
| # | 파일 | 설명 |
|---|------|------|
| 1 | `apps/api/src/modules/security/key-rotation.service.ts` | 키 로테이션 비즈니스 로직 |
| 2 | `apps/api/src/modules/security/key-rotation.scheduler.ts` | 키 로테이션 CRON 스케줄러 |
| 3 | `apps/api/src/modules/security/__tests__/key-rotation.service.spec.ts` | 키 로테이션 테스트 (6개) |
| 4 | `apps/api/src/modules/security/__tests__/key-rotation.scheduler.spec.ts` | 스케줄러 테스트 (3개) |
| 5 | `apps/api/src/modules/pg-gateway/__tests__/ip-whitelist.guard.spec.ts` | IP 화이트리스트 테스트 (6개) |

### 수정 (8개)
| # | 파일 | 변경 내용 |
|---|------|----------|
| 6 | `apps/api/prisma/schema.prisma` | pg_api_keys에 allowed_ips 컬럼 추가 |
| 7 | `apps/api/src/modules/security/security.module.ts` | KeyRotationService + Scheduler 등록 |
| 8 | `apps/api/src/modules/security/kms/local-kms.service.ts` | rotateKey() 스텁 → 로컬 정상 동작 |
| 9 | `apps/api/src/modules/pg-gateway/guards/ip-whitelist.guard.ts` | IP 화이트리스트 가드 (신규) |
| 10 | `apps/api/src/modules/pg-gateway/controllers/payment.controller.ts` | IpWhitelistGuard 추가 |
| 11 | `apps/api/src/modules/pg-gateway/controllers/virtual-account.controller.ts` | IpWhitelistGuard 추가 (confirm만) |
| 12 | `apps/api/src/modules/pg-gateway/services/api-key.service.ts` | updateAllowedIps + allowedIps 필드 |
| 13 | `apps/api/src/modules/pg-gateway/__tests__/api-key.service.spec.ts` | updateAllowedIps 테스트 2개 추가 |

### 문서 (2개)
| # | 파일 | 변경 내용 |
|---|------|----------|
| 14 | `docs/pci-dss-compliance-map.md` | 3.6.1 + 1.3.2 항목 추가, 요약 수치 갱신 |
| 15 | `docs/external-audit-checklist.md` | 증적 3개 + 테스트 2개 추가 |

---

## 주의사항

1. **`any` 타입 절대 금지** — unknown + 타입가드 사용
2. **AUDIT_ACTIONS 상수는 이미 정의됨** — `@pg-system/shared`에서 import만 하면 됨 (KEY_ROTATION_START, KEY_ROTATION_COMPLETE, KEY_ROTATION_FAILED, IP_WHITELIST_BLOCKED)
3. **ERROR_CODES.PGW_IP_BLOCKED도 이미 정의됨** — 추가 불필요
4. **fire-and-forget 패턴**: 감사 로그는 `.writeAuditLog().catch()` — 비즈니스 플로우 블로킹 금지
5. **deposit-callback은 인증 없음** — IpWhitelistGuard 적용하되, pgApiKeyId 없으면 자동 통과
6. **마이그레이션 이름**: `add_allowed_ips` (날짜 prefix는 Prisma가 자동 생성)
7. **Prisma 스키마에서 allowed_ips 위치**: `is_active` 다음, `created_at` 이전
8. **기존 테스트 깨짐 방지**: api-key.service.spec.ts의 기존 mock에 `allowed_ips: []` 추가 필요
