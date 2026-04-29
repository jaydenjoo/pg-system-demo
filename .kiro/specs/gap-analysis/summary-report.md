# PG System CC-SDD 전체 점검 종합 보고서

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석 | 대상: 15개 NestJS 백엔드 모듈 전체

---

## 1. 종합 등급: B+ (81/100)

| # | 모듈 | 등급 | 점수 | CRITICAL | HIGH | MEDIUM |
|---|------|------|------|----------|------|--------|
| 1 | auth | A | 91 | 0 | 2 | 3 |
| 2 | security | A- | 89 | 0 | 3 | 2 |
| 3 | pg-gateway | A- | 87 | 1 | 4 | 3 |
| 4 | dashboard | A- | 85 | 1 | 5 | 3 |
| 5 | settlements | B+ | 81 | 1 | 4 | 3 |
| 6 | commissions | B+ | 81 | 1 | 3 | 3 |
| 7 | agents | B+ | 80 | 1 | 4 | 3 |
| 8 | notifications | B+ | 80 | 2 | 5 | 4 |
| 9 | health | B+ | 80 | 0 | 4 | 3 |
| 10 | users | B+ | 79 | 1 | 4 | 3 |
| 11 | system | B+ | 79 | 2 | 5 | 4 |
| 12 | transactions | B+ | 79 | 1 | 4 | 3 |
| 13 | merchants | B+ | 78 | 1 | 4 | 3 |
| 14 | deposits | B | 76 | 1 | 4 | 4 |
| 15 | metrics | B | 74 | 1 | 4 | 3 |
| | **합계** | **B+** | **81** | **14** | **55** | **45** |

### 영역별 평균

| 영역 | 평균 점수 | 등급 |
|------|----------|------|
| 아키텍처/의존성 | 86 | A- |
| 컨트롤러/DTO | 81 | B+ |
| 서비스 레이어 | 80 | B+ |
| 테스트 커버리지 | 72 | B- |

---

## 2. 횡단 패턴 분석 (Cross-Cutting Findings)

15개 모듈 전체에서 반복 발견된 구조적 문제를 패턴별로 분류합니다.

### Pattern A: 감사 로그 미연동 (10+ 모듈)

**심각도**: CRITICAL | **PCI DSS**: 10.2.2 위반

| 모듈 | 증상 |
|------|------|
| transactions | `_performedBy` 파라미터 수신, `writeAuditLog()` 미호출 |
| merchants | 동일 |
| agents | 동일 |
| deposits | 동일 |
| users | 동일 |
| settlements | 동일 |
| commissions | 동일 |
| system | 동일 |
| dashboard | 미적용 (읽기 전용이므로 MEDIUM) |

**근본 원인**: SecurityModule에 `writeAuditLog()` 유틸이 존재하나, 각 서비스가 이를 import/호출하지 않음. 구현 패턴이 확립되지 않은 상태에서 모듈이 증가하며 누락이 전파됨.

**통합 수정안**:
1. `AuditInterceptor` 확장 — 현재 컨트롤러 레벨에서만 동작하므로, 서비스 레벨 CUD 메서드에도 감사 기록 필요
2. 또는 `@Auditable()` 데코레이터 패턴 — 서비스 메서드에 선언적으로 감사 로그 활성화
3. 변경 전후값(`before`/`after`) 기록 필수 — PCI DSS 10.2.2 "변경 내용 추적"

### Pattern B: check-then-act Race Condition (7 모듈)

**심각도**: CRITICAL~HIGH

| 모듈 | 메서드 | 패턴 |
|------|--------|------|
| system | `createCode()` | `findUnique()` → `create()` |
| transactions | `cancelTransaction()` | `findUnique()` → `update()` |
| merchants | `createMerchant()` | `count()` → `create()` |
| agents | `createAgent()` | `count()` → `create()` |
| deposits | `createDeposit()` | `findUnique()` → `create()` |
| users | `createUser()` | `findUnique()` → `create()` |
| settlements | `executeSettlement()` | `findMany()` → `updateMany()` |

**근본 원인**: Prisma의 `$transaction()` 미사용 또는 isolation level 미지정. 각 모듈이 독립적으로 구현되며 트랜잭션 래핑 패턴이 표준화되지 않음.

**통합 수정안**:
1. **DB 유니크 제약 확인** — 복합 유니크 인덱스가 이미 있으면 `create()` 시 PrismaClientKnownRequestError(P2002) catch로 충분
2. **트랜잭션 필요 시** — `$transaction({ isolationLevel: 'Serializable' })` 내부에서 체크+생성 원자적 수행
3. **조건부 업데이트** — `update({ where: { id, status: 'ACTIVE' } })` 패턴으로 동시성 안전

### Pattern C: Swagger 응답 타입 미상세 (12 모듈)

**심각도**: HIGH

| 적용 대상 | 상태 |
|-----------|------|
| auth, security, health | 응답 DTO 정의 완료 (모범 사례) |
| pg-gateway | 부분 정의 |
| 나머지 11 모듈 | `@ApiResponse({ description })` 만 존재, `type` 미명시 |

**통합 수정안**: 모듈별 `ResponseDto` 클래스 생성 + `@ApiResponse({ type: XxxResponseDto })` 적용. health 모듈의 `HealthResponseDto`를 참고 패턴으로 사용.

### Pattern D: 매직 스트링 하드코딩 (8 모듈)

**심각도**: HIGH

transactions, settlements, commissions, dashboard, merchants, agents, deposits, users에서 `"APPROVED"`, `"CALCULATED"`, `"PENDING"` 등 상태값을 문자열 리터럴로 직접 사용.

**통합 수정안**: `packages/shared/src/constants/`에 `TRANSACTION_STATUS`, `SETTLEMENT_STATUS`, `MERCHANT_STATUS` 등 Enum/상수 객체 정의 → 전 모듈 import

### Pattern E: 테스트 커버리지 격차 (전체)

**심각도**: HIGH

| 수준 | 모듈 |
|------|------|
| 테스트 0건 | metrics, health |
| E2E 테스트 부재 | dashboard, system, notifications |
| 캐시 히트 테스트 부재 | system, 캐시 사용 모듈 전체 |
| 에지 케이스 부족 | deposits, commissions |

### Pattern F: Zero `any` 타입 (전체 15/15 모듈)

**등급**: A+ (강점)

전체 15개 모듈에서 `any` 타입 0건. `unknown` + 타입 가드 패턴 완전 준수.

---

## 3. CRITICAL 이슈 통합 목록 (14건)

즉시 수정이 필요한 항목을 우선순위대로 정렬합니다.

| 순위 | 모듈 | ID | 이슈 | 영향 |
|------|------|----|------|------|
| 1 | **횡단** | A-all | 감사 로그 미연동 (10+ 모듈) | PCI DSS 10.2.2 위반, 변경 추적 불가 |
| 2 | dashboard | C-1 | merchantId/agentId 쿼리 미적용 | 가맹점 간 데이터 격리 우회 |
| 3 | metrics | C-1 | /metrics @Public() 무인증 | 내부 시스템 정보 노출 |
| 4 | notifications | C-1 | CRITICAL 알림 유실 시 폴백 없음 | 보안 이벤트 사각지대 |
| 5 | notifications | C-2 | 알림 전송 이력 미기록 | 감사 추적 불가 |
| 6 | system | C-1 | createCode() race condition | 중복 시스템 코드 생성 |
| 7 | system | C-2 | 시스템 코드 CRUD 감사 미기록 | 설정 변경 추적 불가 |
| 8 | pg-gateway | C-1 | (개별 보고서 참조) | 결제 흐름 관련 |
| 9 | settlements | C-1 | (개별 보고서 참조) | 정산 정합성 |
| 10 | commissions | C-1 | (개별 보고서 참조) | 수수료 계산 |
| 11 | transactions | C-1 | (개별 보고서 참조) | 거래 상태 관리 |
| 12 | merchants | C-1 | (개별 보고서 참조) | 가맹점 데이터 |
| 13 | deposits | C-1 | (개별 보고서 참조) | 보증금 관리 |
| 14 | users | C-1 | (개별 보고서 참조) | 사용자 데이터 |

---

## 4. 수정 로드맵 (권장)

### Sprint 1: 감사 로그 + 데이터 격리 (3일)

| 작업 | 대상 | 예상 |
|------|------|------|
| `@Auditable()` 데코레이터 또는 AuditInterceptor 확장 | security 모듈 | 4h |
| 전 모듈 CUD 메서드에 감사 로그 연동 | 10개 모듈 | 6h |
| Dashboard merchantId/agentId 쿼리 조건 추가 | dashboard | 2h |
| /metrics 인증 보호 (IP 가드 또는 토큰) | metrics | 1h |

### Sprint 2: Race Condition + 알림 안정화 (2일)

| 작업 | 대상 | 예상 |
|------|------|------|
| check-then-act → 트랜잭션 래핑 (7개 모듈) | 횡단 | 4h |
| CRITICAL 알림 재시도 큐 또는 DB 저장 | notifications | 2h |
| 알림 전송 이력 테이블 + 기록 | notifications | 1.5h |
| Email 채널 재시도 + SMTP secure 환경변수화 | notifications | 1h |

### Sprint 3: Swagger + 상수 + 테스트 (3일)

| 작업 | 대상 | 예상 |
|------|------|------|
| 응답 DTO 생성 + @ApiResponse type 적용 | 11개 모듈 | 6h |
| 매직 스트링 → shared 상수/Enum 전환 | 8개 모듈 | 3h |
| metrics, health 테스트 작성 | 2개 모듈 | 3h |
| 캐시 히트 테스트 + 누락 메서드 테스트 | system 외 | 2h |

### Sprint 4: MEDIUM 이슈 정리 (2일)

| 작업 | 대상 | 예상 |
|------|------|------|
| Health readiness 분화 (Redis + 외부 서비스) | health | 2h |
| APP_VERSION 동적 로드 | health | 0.5h |
| dedup Map 상한 + LRU | notifications | 0.5h |
| 심각도 기반 채널 라우팅 | notifications | 1h |
| 날짜 범위 교차 검증 | dashboard | 0.5h |
| groupCode 파라미터 검증 | system | 0.5h |
| 캐시 무효화 헬퍼 추출 | system | 0.5h |
| E2E 테스트 추가 | dashboard, system | 4h |

---

## 5. 강점 요약 (유지 사항)

| 영역 | 상세 |
|------|------|
| **Zero `any`** | 전체 15/15 모듈 `any` 타입 0건 — TypeScript 최고 수준 |
| **Prisma.sql 안전 쿼리** | Raw SQL 사용 시 태그드 리터럴로 SQL 인젝션 방지 |
| **BigInt 금액 처리** | 전 모듈 BigInt 일관 사용, DTO에서 string 변환 |
| **shared 패키지** | ERROR_CODES, CACHE_TTL, PERMISSIONS 공유 상수 체계 |
| **Strategy 패턴** | Notifications(채널), PG Gateway(Acquirer) — 확장 용이 |
| **OwnershipInterceptor** | 컨트롤러 레벨 가맹점/대리점 데이터 격리 |
| **3-Probe 헬스체크** | k8s 베스트 프랙티스 (health/ready/live) |
| **커스텀 Prometheus 레지스트리** | 기본 레지스트리 오염 방지 |
| **에러 코드 체계** | 모듈별 접두사 (AUTH_001, TXN_001, SYS_001 등) |
| **Soft Delete** | `is_active: false` 논리 삭제로 이력 보존 |
| **RBAC** | 역할 기반 권한 + PermissionsGuard 전 모듈 적용 |
| **PgBasicAuthGuard / JwtAuthGuard** | 가맹점(API키) / 관리자(JWT) 이원화 인증 |

---

## 6. PCI DSS 4.0.1 준수 현황

| 요구사항 | 현재 상태 | 보완 필요 |
|----------|----------|----------|
| 6.4.3 결제 페이지 스크립트 관리 | CSP strict-dynamic 적용 완료 | - |
| 8.3.6 비밀번호 복잡성 | 12자+ 강제 구현 | - |
| 8.4.2 MFA | 구현 완료 | - |
| 10.2.2 감사 로그 | **미완성** — 10+ 모듈 미연동 | Sprint 1 |
| 10.6.1 보안 이벤트 통보 | **불완전** — CRITICAL 알림 유실 가능 | Sprint 2 |
| 3.4 PAN 토큰화 | 카드 토큰화 서비스 구현 완료 | - |
| 6.5.x 보안 코딩 | Zero `any`, Prisma.sql, CSP 등 | Swagger 보강 |

---

## 7. 결론

PG System은 **보안 기반(인증/인가/암호화)**과 **타입 안전성**에서 높은 완성도를 보입니다. 전체 15개 모듈 중 13개가 B+ 이상이며, 핵심 보안 모듈(auth A, security A-)이 최고 등급입니다.

**즉시 조치 필요 사항**:
1. **감사 로그 통합 연동** — PCI DSS 10.2.2의 핵심 요구사항. 현재 10개 모듈에서 미연동
2. **Dashboard 데이터 격리** — merchantId 쿼리 조건 누락으로 가맹점 간 KPI 혼재 가능
3. **Metrics 인증 보호** — 내부 운영 데이터 무인증 노출

위 3개 이슈를 Sprint 1에서 해결하면 종합 등급 **A- (85+)** 달성 가능합니다.

---

> 개별 모듈 상세: `.kiro/specs/gap-analysis/{module}-report.md` 참조
