# Security 모듈 Gap Report (3/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: A- (89/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A- | 86 |
| 컨트롤러/DTO/스케줄러 | A | 87 |
| 테스트 커버리지 | A- | 88 (추정) |
| 아키텍처/의존성 | A | 94 |

---

## CRITICAL (즉시 수정 필요)

### C-1. 해시 체인 검증 스케줄러 부재
- **위치**: `AuditHashChainService.verifyChain()` — 구현 완료, 스케줄러 없음
- **증상**: 체인 검증 로직은 있으나 주기적 실행하는 scheduler가 없음
- **영향**: PCI DSS 10.5.5 "감사 로그 무결성 정기 검증" 미충족. 변조 탐지 불가
- **수정안**: `audit-hash-chain.scheduler.ts` 생성 — `@Cron(EVERY_WEEK)` 지난주 로그 검증 + 실패 시 CRITICAL 리스크 알림

### C-2. LocalKmsService 마스터 키 평문 노출
- **위치**: `kms/local-kms.service.ts` — `getMasterKey()` 환경변수 직접 로드
- **증상**: 마스터 키가 `.env`에 평문 저장, `docker inspect`/`kubectl describe`로 노출 가능
- **영향**: PCI DSS 3.2.1 위반. 마스터 키 노출 = 모든 암호화 데이터 복호화 가능
- **수정안**: 프로덕션은 AWS KMS/HashiCorp Vault 필수. LocalKMS는 개발/테스트 전용 명시. KMS 인터페이스 추상화는 이미 완료 상태

### C-3. 키 로테이션 후 이전 키로 복호화 불가
- **위치**: `key-rotation.service.ts` — `rotateKey()`
- **증상**: 새 키 생성 시 이전 키(oldKeyId)로 암호화된 데이터 복호화 경로 없음. "교체"이지 "로테이션"이 아님
- **영향**: PCI DSS 3.6.1 위반. 기존 카드 토큰/결제 정보 조회 불가
- **수정안**: 이전 키를 RETIRING 상태로 보관 + 비동기 배치로 기존 데이터 새 키로 재암호화

### C-4. 감사 로그 보관 정책 부재
- **위치**: DB 정책 / `SecurityService`
- **증상**: 감사 로그 무제한 저장, PCI DSS 10.7 요구 5년 보관 정책 미명시
- **영향**: 정규 감사 시 "로그 보관 정책 증명" 불가
- **수정안**: 보관 정책 문서화 + 아카이브 메커니즘 추가 (파티셔닝 또는 주기적 아카이브)

---

## HIGH (Sprint 내 수정 권장)

### H-1. 감사 로그 기록 실패 시 Silent Fail
- **위치**: `security.service.ts` — `writeAuditLog()` catch 블록
- **증상**: DB 쓰기 실패해도 에러 로그만 남기고 throw 안 함 (fire-and-forget)
- **영향**: PCI DSS 10.1 위반 가능. 보안 사건 후 감사 로그 누락 시 분석 불가
- **수정안**: 실패 횟수 추적 테이블(`audit_log_failures`) + 프로덕션에서 CRITICAL 알림

### H-2. 스케줄러 동시 실행 방지 미흡
- **위치**: `integrity-monitor.scheduler.ts`, `key-rotation.scheduler.ts`
- **증상**: 다중 인스턴스 배포 시 Cron 작업이 모든 서버에서 동시 실행
- **영향**: 중복 키 로테이션, 중복 FIM 검사로 리소스 낭비 및 감사 로그 오염
- **수정안**: Redis 기반 distributed lock 또는 리더 선출(leader election) 패턴

### H-3. FIM 경로 하드코딩
- **위치**: `INTEGRITY_MONITOR.CRITICAL_PATHS`
- **증상**: Docker 컨테이너 경로와 불일치 가능 (`/app/dist/` vs `./dist/`)
- **영향**: PCI DSS 11.5 "보안 관련 파일 모니터링" 누락 가능
- **수정안**: `process.cwd()` 기반 동적 경로 또는 환경변수로 관리

### H-4. 리스크 알림 발송 재시도 없음
- **위치**: `security.service.ts` — `createRiskAlert()`
- **증상**: Slack/Email 발송 실패 시 fire-and-forget. CRITICAL 알림도 누락 가능
- **영향**: PCI DSS 10.6.1 "보안 이벤트 즉각 알림" 미준수
- **수정안**: CRITICAL 심각도에 대해 exponential backoff 3회 재시도

### H-5. AuditLogQueryDto 날짜 범위 검증 부재
- **위치**: `dto/audit-log-query.dto.ts`
- **증상**: startDate > endDate, 90년치 쿼리 등 비정상 범위 검증 없음
- **영향**: 극단적 범위 쿼리로 DB 부하 유발 가능
- **수정안**: 커스텀 밸리데이터로 endDate >= startDate + 최대 90일 제한

### H-6. 감사 로그 접근 통제 불명확
- **위치**: `SecurityController`
- **증상**: 역할별(admin/agent/merchant) 감사 로그 조회 범위 제한 불명확
- **영향**: 가맹점이 다른 가맹점 감사 로그 조회 가능성
- **수정안**: Admin=전사, Agent=소속 가맹점, Merchant=자기 결제 이력만 조회

---

## MEDIUM (다음 Sprint 수정)

### M-1. 해시 체인 검증 시 전체 로그 메모리 로드
- **위치**: `audit-hash-chain.service.ts` — `verifyChain()`
- **증상**: 90일치 감사 로그 전체를 findMany로 메모리 로드
- **영향**: 대규모 환경에서 OOM 위험
- **수정안**: 페이지네이션 기반 분할 검증

### M-2. FIM 파일 스캔 순차 처리
- **위치**: `integrity-monitor.service.ts` — `scanFiles()`
- **증상**: 파일을 순차적으로 스캔, 100개 × 100ms = 10초+
- **영향**: 스케줄러 실행 시 I/O 블로킹
- **수정안**: `Promise.allSettled` 병렬 처리 (10개 단위 청크)

### M-3. 에러 처리 유틸 중복
- **위치**: 여러 파일에서 `err instanceof Error ? err.message : String(err)` 반복
- **영향**: DRY 원칙 위반, 유지보수성 저하
- **수정안**: `common/utils/error.util.ts` 중앙화

### M-4. 키 로테이션 정책 문서 부재
- **위치**: `KeyRotationService`
- **증상**: 로테이션 빈도(90일?), 구 키 보관 기간 명시 없음
- **영향**: 감사 시 "키 로테이션 정책 증명" 불가
- **수정안**: 정책 문서 작성 (빈도/보관/영향도)

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **해시 체인 감사 로그** | SHA-256 체인 + length-prefix 인코딩, 블록체인 원리 차용 (PCI DSS 10.5.5) |
| **KMS 추상화** | `KmsService` 인터페이스 + `KMS_SERVICE` Symbol DI → AWS KMS/Vault 전환 용이 |
| **FIM 자동화** | 매시간 스케줄 + 변경/신규/삭제 3분류 + 자동 알림 (PCI DSS 11.5) |
| **키 로테이션 상태 관리** | ACTIVE→ROTATING→ACTIVE 전환, 실패 시 롤백 |
| **직렬화 트랜잭션** | 감사 로그 해시 체인 race condition 완전 제거 |
| **모듈 분리 철저** | 순환 참조 없음, SecurityModule 독립적 DI 구조 |
| **SRP 준수** | 5개 서비스 각각 단일 책임 (감사/해시체인/FIM/키로테이션/KMS) |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |
| **Optional Dependencies** | NotificationsService 없이도 보안 기능 작동 (graceful degradation) |

---

## PCI DSS 준수 현황

| 요구사항 | 상태 | 상세 |
|----------|------|------|
| 10.2 사용자 접근 기록 | PASS | AuditInterceptor + audit_logs |
| 10.2.2 금융 거래 이력 | PASS | 결제/취소 서비스에서 명시적 writeAuditLog |
| 10.3.3 로그 위변조 방지 | PASS | 해시 체인 (prevHash + currentHash) |
| 10.5.5 로그 무결성 모니터링 | PARTIAL | 검증 로직 완료, 스케줄러 부재 (C-1) |
| 10.7 로그 보관 정책 | FAIL | 정책/아카이브 메커니즘 부재 (C-4) |
| 11.5 파일 무결성 모니터링 | PASS | IntegrityMonitorService 매시간 실행 |
| 3.4 카드번호 보호 | PASS | AES-256-GCM + 토큰화 |
| 3.6.1 키 로테이션 | PARTIAL | 로직 있으나 이전 키 보관 미흡 (C-3) |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 2h | 없음 |
| 2 | C-3 | 8h | DB 스키마 (키 상태 추가) |
| 3 | C-4 | 4h | DB 파티셔닝 설계 |
| 4 | C-2 | 40h+ | AWS KMS/Vault 인프라 (프로덕션 전) |
| 5 | H-1 | 2h | 없음 |
| 6 | H-2 | 3h | Redis 또는 리더 선출 |
| 7 | H-4 + H-5 | 2h | 없음 (함께 수정) |
| 8 | H-3 + H-6 | 2h | 없음 |

> C-1~C-4는 PCI DSS 감사 대비 필수. C-2(KMS 전환)는 프로덕션 배포 전 완료 필요
