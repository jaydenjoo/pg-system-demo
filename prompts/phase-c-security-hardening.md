# Phase C: 보안 강화 (PCI-DSS 컴플라이언스) — Sonnet 지시 프롬프트

> **역할**: Sonnet 4.6 = 실제 코딩 실행
> **프로젝트**: pg-system (🔴 PG 결제 = 보안 최우선)
> **현재 상태**: Phase B 완료 (36 suites / 499 tests PASS)
> **비유**: 금고는 만들었지만, CCTV와 경보기를 아직 안 달은 상태

---

## 전체 구조

| 태스크 | 내용 | 난이도 | 신규/수정 파일 수 |
|--------|------|--------|------------------|
| C-1 | 감사 로그 — PG Gateway 비즈니스 이벤트 명시 기록 | ★★ | ~4 |
| C-2 | 암호화 키 로테이션 구현 | ★★★ | ~5 |
| C-3 | IP Whitelist 가드 | ★★ | ~5 |
| C-4 | PCI-DSS 셀프 평가 스크립트 업데이트 | ★ | ~2 |

---

## C-1: 감사 로그 — PG Gateway 비즈니스 이벤트 명시 기록

### 현재 상태
- `AuditInterceptor` (apps/api/src/common/interceptors/audit.interceptor.ts)가 모든 HTTP 요청을 자동 기록
- 그러나 **비즈니스 레벨 이벤트** (결제 승인, 취소, 환불 등)는 인터셉터의 제네릭 로깅에만 의존
- PCI DSS 10.2 요구: "결제 관련 이벤트는 비즈니스 맥락(금액, 결과, 사유)과 함께 명시 기록"

### 해야 할 일

#### 1) 공유 상수 추가
**파일**: `packages/shared/src/constants/index.ts`

```typescript
// 기존 상수 파일에 추가 (새 파일 생성 금지, 기존 export에 병합)
export const AUDIT_ACTIONS = {
  // PG Gateway 비즈니스 이벤트
  PG_PAYMENT_CONFIRM: 'PG_PAYMENT_CONFIRM',
  PG_PAYMENT_CANCEL: 'PG_PAYMENT_CANCEL',
  PG_PAYMENT_PARTIAL_CANCEL: 'PG_PAYMENT_PARTIAL_CANCEL',
  PG_VIRTUAL_ACCOUNT_ISSUED: 'PG_VIRTUAL_ACCOUNT_ISSUED',
  PG_VIRTUAL_ACCOUNT_DEPOSITED: 'PG_VIRTUAL_ACCOUNT_DEPOSITED',
  PG_FDS_ALERT: 'PG_FDS_ALERT',
  // 키 관리
  KEY_ROTATION_START: 'KEY_ROTATION_START',
  KEY_ROTATION_COMPLETE: 'KEY_ROTATION_COMPLETE',
  KEY_ROTATION_FAILED: 'KEY_ROTATION_FAILED',
  // IP 관리
  IP_WHITELIST_BLOCKED: 'IP_WHITELIST_BLOCKED',
} as const;
```

#### 2) PaymentConfirmService에 명시 감사 로그 추가
**파일**: `apps/api/src/modules/pg-gateway/services/payment-confirm.service.ts`

현재 이 서비스는 `SecurityService`를 주입받지 않음. 다음을 수행:

1. `constructor`에 `SecurityService` 주입 추가
2. 결제 승인 성공 후 `writeAuditLog` 호출:

```typescript
await this.security.writeAuditLog({
  action: AUDIT_ACTIONS.PG_PAYMENT_CONFIRM,
  resourceType: 'pg_payment_orders',
  resourceId: order.id,
  detail: {
    paymentKey: order.payment_key,
    merchantId,
    amount: Number(order.amount),
    method: order.method,
    acquirerApprovalNo: /* 카드사 승인번호 */,
  },
  ipAddress: /* request에서 추출 — 컨트롤러에서 전달받도록 파라미터 추가 */,
});
```

**주의**: `writeAuditLog`는 fire-and-forget 패턴. `await` 쓰되 결제 흐름에 영향 주지 않도록 try-catch 감싸기.

#### 3) PaymentCancelService에 명시 감사 로그 추가
**파일**: `apps/api/src/modules/pg-gateway/services/payment-cancel.service.ts`

현재 `SecurityService` 미주입. 위와 동일 패턴:

```typescript
await this.security.writeAuditLog({
  action: isFull ? AUDIT_ACTIONS.PG_PAYMENT_CANCEL : AUDIT_ACTIONS.PG_PAYMENT_PARTIAL_CANCEL,
  resourceType: 'pg_payment_orders',
  resourceId: order.id,
  detail: {
    paymentKey: order.payment_key,
    merchantId,
    cancelAmount: Number(cancelAmount),
    cancelReason,
  },
  ipAddress,
});
```

#### 4) VirtualAccountService에 감사 로그 추가 (발급 + 입금 확인)
**파일**: `apps/api/src/modules/pg-gateway/services/virtual-account.service.ts`

- 가상계좌 발급: `AUDIT_ACTIONS.PG_VIRTUAL_ACCOUNT_ISSUED`
- 입금 확인: `AUDIT_ACTIONS.PG_VIRTUAL_ACCOUNT_DEPOSITED`

#### 5) 테스트
각 서비스 테스트에서 `writeAuditLog` 호출 여부 검증:
- `mockSecurity.writeAuditLog`가 올바른 `action`과 `detail`로 호출되는지 확인
- `writeAuditLog` 실패 시 결제 흐름이 중단되지 않는지 확인 (격리 테스트)

---

## C-2: 암호화 키 로테이션 구현

### 현재 상태
- `LocalKmsService` (apps/api/src/modules/security/kms/local-kms.service.ts): `rotateKey()`가 **스텁** — UUID만 생성하고 실제 로테이션 안 함
- `encryption_key_metadata` 테이블 존재 (schema.prisma:521-532): key_alias, status, rotation_period_days, last_rotated_at, next_rotation_at
- `KmsService` 인터페이스 (kms.interface.ts): `rotateKey(keyId: string): Promise<string>` 정의됨
- `agents.bank_account` (schema:159), `merchants.bank_account` (schema:189): TODO 주석만 있고 암호화 미적용

### 해야 할 일

#### 1) KeyRotationService 생성
**파일**: `apps/api/src/modules/security/kms/key-rotation.service.ts` (신규)

```typescript
@Injectable()
export class KeyRotationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
    private readonly security: SecurityService,
  ) {}

  /**
   * 키 로테이션 실행
   * 1. encryption_key_metadata에서 대상 키 조회
   * 2. 새 키 생성 (KmsService.rotateKey)
   * 3. 기존 키 상태를 ROTATING → 암호화 데이터 재암호화 → 완료 후 OLD 키 INACTIVE
   * 4. 감사 로그 기록
   */
  async rotateKey(keyAlias: string): Promise<RotationResult> { ... }

  /**
   * 로테이션이 필요한 키 목록 조회
   * next_rotation_at <= now() AND status = 'ACTIVE'
   */
  async findKeysNeedingRotation(): Promise<encryption_key_metadata[]> { ... }

  /**
   * 자동 로테이션 스케줄러에서 호출
   */
  async handleScheduledRotation(): Promise<void> { ... }
}
```

**RotationResult 타입** (types에 정의):
```typescript
export interface RotationResult {
  success: boolean;
  keyAlias: string;
  oldKeyId: string;
  newKeyId: string;
  reEncryptedRecords: number;
  error?: string;
}
```

#### 2) LocalKmsService.rotateKey() 실제 구현
**파일**: `apps/api/src/modules/security/kms/local-kms.service.ts`

현재 코드 (교체할 부분):
```typescript
async rotateKey(_keyId: string): Promise<string> {
  const newKeyId = crypto.randomUUID();
  this.logger.warn(`[LocalKMS] Key rotation requested...`);
  return newKeyId;
}
```

수정:
```typescript
async rotateKey(keyId: string): Promise<string> {
  // 1. 새 256-bit 키 생성
  const newKey = crypto.randomBytes(32).toString('hex');
  const newKeyId = crypto.randomUUID();
  // 2. 키 저장소에 등록 (로컬 환경에서는 환경변수 기반 — 실제 프로덕션은 Vault/KMS)
  // 3. 이전 키는 복호화 전용으로 유지 (dual-key window)
  this.logger.log(`[LocalKMS] Key rotated: old=${keyId} → new=${newKeyId}`);
  return newKeyId;
}
```

**핵심 제약**: 로컬 환경이므로 `ENCRYPTION_KEY` 환경변수 1개로 동작. 로테이션 시:
- 새 키는 `ENCRYPTION_KEY_NEW`에 기록
- 재암호화 완료 후 `ENCRYPTION_KEY`를 새 키로 교체
- 이 듀얼 키 윈도우 로직을 `encrypt()`/`decrypt()`에도 반영

#### 3) 키 로테이션 스케줄러
**파일**: `apps/api/src/modules/security/kms/key-rotation.scheduler.ts` (신규)

```typescript
@Injectable()
export class KeyRotationScheduler {
  @Cron('0 3 * * 0') // 매주 일요일 03:00
  async handleWeeklyCheck(): Promise<void> {
    // findKeysNeedingRotation() → rotateKey() 순차 실행
  }
}
```

#### 4) SecurityModule에 등록
**파일**: `apps/api/src/modules/security/security.module.ts`

`KeyRotationService`, `KeyRotationScheduler`를 providers에 추가.

#### 5) 테스트
**파일**: `apps/api/src/modules/security/kms/__tests__/key-rotation.service.spec.ts` (신규)

- TC-K1: 정상 로테이션 → encryption_key_metadata 상태 변경 확인 (ACTIVE → ROTATING → ACTIVE)
- TC-K2: 재암호화 대상 0건 → 빠른 완료
- TC-K3: 로테이션 중 오류 → 롤백 (기존 키 ACTIVE 유지)
- TC-K4: findKeysNeedingRotation → next_rotation_at 기반 필터 검증
- TC-K5: 감사 로그 기록 확인 (KEY_ROTATION_START/COMPLETE/FAILED)

---

## C-3: IP Whitelist 가드

### 현재 상태
- `PgBasicAuthGuard` (apps/api/src/modules/pg-gateway/guards/pg-basic-auth.guard.ts): API 키 인증만 수행
- 가맹점별 허용 IP 필드 **없음** — schema에 `allowed_ips` 미존재
- IP는 `AuditInterceptor`에서 기록용으로만 추출

### 해야 할 일

#### 1) DB 스키마 변경 — Prisma 마이그레이션
**파일**: `apps/api/prisma/schema.prisma`

`pg_api_keys` 모델에 필드 추가:
```prisma
model pg_api_keys {
  // ... 기존 필드 ...
  allowed_ips       String[]  @default([])  // 빈 배열 = 제한 없음 (모든 IP 허용)
  // ...
}
```

마이그레이션 생성:
```bash
npx prisma migrate dev --name add_ip_whitelist
```

#### 2) IP Whitelist 가드 생성
**파일**: `apps/api/src/modules/pg-gateway/guards/ip-whitelist.guard.ts` (신규)

```typescript
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PgAuthenticatedRequest>();

    // PgBasicAuthGuard가 먼저 실행되어 pgApiKeyId가 세팅된 상태
    const apiKeyId = request.pgApiKeyId;
    if (!apiKeyId) return true; // 가드 순서 보장 안 되면 통과 (Basic Auth가 거부함)

    const apiKey = await this.prisma.pg_api_keys.findUnique({
      where: { id: apiKeyId },
      select: { allowed_ips: true },
    });

    // 빈 배열이면 모든 IP 허용
    if (!apiKey?.allowed_ips || apiKey.allowed_ips.length === 0) {
      return true;
    }

    const clientIp = this.extractClientIp(request);

    if (!apiKey.allowed_ips.includes(clientIp)) {
      // 차단 로그 기록 (fire-and-forget)
      void this.security.writeAuditLog({
        action: AUDIT_ACTIONS.IP_WHITELIST_BLOCKED,
        resourceType: 'pg_api_keys',
        resourceId: apiKeyId,
        detail: { blockedIp: clientIp, allowedIps: apiKey.allowed_ips },
        ipAddress: clientIp,
      });

      throw new UnauthorizedException({
        code: ERROR_CODES.PGW_IP_BLOCKED, // 새 에러 코드 추가 필요
        message: '허용되지 않은 IP 주소',
      });
    }

    return true;
  }

  private extractClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
}
```

#### 3) 에러 코드 추가
**파일**: `packages/shared/src/constants/index.ts`

```typescript
// ERROR_CODES에 추가
PGW_IP_BLOCKED: 'PGW_IP_BLOCKED',
```

#### 4) 가드 적용 — 컨트롤러에 순서 지정
**파일**: `apps/api/src/modules/pg-gateway/controllers/payment.controller.ts`

```typescript
@UseGuards(PgBasicAuthGuard, IpWhitelistGuard)
```

**가드 순서 중요**: `PgBasicAuthGuard` → `IpWhitelistGuard` (API 키 인증 후 IP 체크)

같은 패턴을 다른 PG 컨트롤러에도 적용:
- `api-key.controller.ts`
- `webhook.controller.ts`
- `virtual-account.controller.ts`

#### 5) API 키 관리 — 허용 IP 설정 엔드포인트
**파일**: `apps/api/src/modules/pg-gateway/services/api-key.service.ts`

기존 API 키 발급/조회 서비스에 IP 관리 메서드 추가:
```typescript
async updateAllowedIps(apiKeyId: string, merchantId: string, ips: string[]): Promise<void> {
  // IP 형식 검증 (IPv4/IPv6)
  // merchantId 소유권 확인
  // pg_api_keys.allowed_ips 업데이트
}
```

#### 6) 테스트
**파일**: `apps/api/src/modules/pg-gateway/__tests__/ip-whitelist.guard.spec.ts` (신규)

- TC-IP1: allowed_ips 빈 배열 → 모든 IP 통과
- TC-IP2: 등록된 IP → 통과
- TC-IP3: 미등록 IP → 401 + 감사 로그 기록 확인
- TC-IP4: x-forwarded-for 헤더 파싱 (프록시 환경)
- TC-IP5: pgApiKeyId 없는 경우 (가드 순서 이상) → 통과 (Basic Auth가 처리)

---

## C-4: PCI-DSS 셀프 평가 업데이트

### 현재 상태
- `docs/pci-dss-compliance-map.md`: 94% (32/34), 갭 2개 (TLS 1.3 인증서, 보안 이벤트 알림)
- `docs/external-audit-checklist.md`: QSA 증빙 체크리스트 18항목

### 해야 할 일

#### 1) pci-dss-compliance-map.md 업데이트
Phase C 구현 후 달성 항목 반영:
- **10.2**: 결제 비즈니스 이벤트 명시 감사 로그 → ✅ 완료 (C-1)
- **3.6.1**: 암호화 키 로테이션 메커니즘 → ✅ 완료 (C-2)
- **1.3.2**: IP Whitelist 기반 접근 제어 → ✅ 완료 (C-3)
- 전체 컴플라이언스 %를 재계산하여 업데이트

#### 2) external-audit-checklist.md에 증빙 경로 추가
- 키 로테이션 로그: `audit_logs WHERE action LIKE 'KEY_ROTATION_%'`
- IP 차단 로그: `audit_logs WHERE action = 'IP_WHITELIST_BLOCKED'`
- 비즈니스 감사 로그: `audit_logs WHERE action LIKE 'PG_%'`

---

## 실행 순서 & 검증

### 구현 순서
1. **C-1 먼저** (감사 로그 상수 + 서비스 수정) — 다른 태스크에서 참조
2. **C-3 다음** (IP Whitelist) — schema 변경 필요하므로 일찍 실행
3. **C-2** (키 로테이션) — 가장 복잡, C-1 감사 로그 활용
4. **C-4 마지막** (문서 업데이트) — C-1~3 완료 후

### 검증 4단계 (각 태스크 완료 후)
```bash
npx tsc --noEmit          # 타입 체크
npx eslint . --fix        # 린트
npm run build             # 빌드
npm run test              # 테스트
```

### 도구 활용 지시
- **TDD**: 각 서비스 구현 전 테스트 먼저 작성 (RED → GREEN → IMPROVE)
- **서브에이전트**: C-1/C-3은 독립적이므로 병렬 작업 가능. 다만 상수 파일 충돌 주의
- **코드 리뷰**: 각 태스크 완료 후 security-reviewer 관점에서 셀프 체크
  - 에러 메시지에 내부 정보 노출 없는지
  - 감사 로그 실패가 비즈니스 흐름을 중단하지 않는지
  - IP 추출 로직이 프록시 환경에서 안전한지

### 절대 금지 (이 Phase 특별 규칙)
- `any` 타입 사용 금지
- 감사 로그 실패 시 결제 흐름 중단 금지 (fire-and-forget + try-catch)
- IP 주소를 에러 응답에 포함 금지 (보안 정보 노출)
- 키 로테이션 중 서비스 중단 금지 (듀얼 키 윈도우 필수)
- Raw SQL 사용 금지 (Prisma ORM만 사용)

---

## 참고 파일 경로 (읽기 필요)

| 파일 | 용도 |
|------|------|
| `apps/api/src/modules/security/security.service.ts` | writeAuditLog 시그니처 확인 |
| `apps/api/src/modules/security/audit-hash-chain.service.ts` | 해시 체인 구조 이해 |
| `apps/api/src/modules/security/kms/local-kms.service.ts` | rotateKey 스텁 확인 |
| `apps/api/src/modules/security/kms/kms.interface.ts` | KmsService 인터페이스 |
| `apps/api/src/modules/pg-gateway/guards/pg-basic-auth.guard.ts` | 기존 인증 가드 패턴 |
| `apps/api/src/modules/pg-gateway/services/payment-confirm.service.ts` | 결제 승인 서비스 |
| `apps/api/src/modules/pg-gateway/services/payment-cancel.service.ts` | 결제 취소 서비스 |
| `apps/api/src/modules/pg-gateway/services/virtual-account.service.ts` | 가상계좌 서비스 |
| `apps/api/src/modules/pg-gateway/pg-gateway.module.ts` | 모듈 DI 등록 |
| `apps/api/src/modules/security/security.module.ts` | 보안 모듈 DI |
| `apps/api/prisma/schema.prisma` | DB 스키마 (pg_api_keys, encryption_key_metadata) |
| `packages/shared/src/constants/index.ts` | 공유 상수 (AUDIT_ACTIONS, ERROR_CODES 추가) |

---

## 예상 최종 결과

- 신규 파일: ~4개 (ip-whitelist.guard, key-rotation.service, key-rotation.scheduler, 테스트 2개)
- 수정 파일: ~8개 (상수, 스키마, 서비스 3개, 컨트롤러 4개, 모듈 2개)
- 신규 테스트: ~15개 (TC-K1~5, TC-IP1~5, 감사 로그 검증 ~5개)
- PCI DSS 컴플라이언스: 94% → ~97% (34/34 중 33 달성 예상, TLS 1.3은 인프라 영역)
