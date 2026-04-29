# Dashboard 모듈 Gap Report (11/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: A- (85/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A- | 86 |
| 컨트롤러/DTO | B+ | 82 |
| 테스트 커버리지 | B+ | 84 |
| 아키텍처/의존성 | A- | 88 |

---

## CRITICAL (즉시 수정 필요)

### C-1. merchantId/agentId DTO 파라미터 서비스 미사용 — 데이터 격리 우회
- **위치**: `dashboard.service.ts` 전체 6개 메서드, `dto/dashboard-query.dto.ts`
- **증상**: DTO에 `merchantId`, `agentId` 필드가 정의되어 있으나, 서비스 메서드에서 해당 값을 쿼리 조건에 사용하지 않음. OwnershipInterceptor가 컨트롤러에 적용되어 있으나 서비스 레벨에서는 전체 데이터 집계
- **영향**: OwnershipInterceptor가 request.merchantId를 설정해도, 서비스가 이를 무시하면 다른 가맹점/대리점의 KPI 데이터가 섞여서 반환될 수 있음. 데이터 격리 불완전
- **수정안**: 서비스 메서드에서 `merchantId`/`agentId`가 존재할 경우 `WHERE merchant_id = $1` 조건 추가. 특히 `getSummary()`, `getTransactionStats()`, `getDailyTrend()` 등 집계 쿼리에 필수

---

## HIGH (Sprint 내 수정 권장)

### H-1. 상태값 매직 스트링 — Enum/상수 미사용
- **위치**: `dashboard.service.ts` — `"APPROVED"`, `"CALCULATED"` 등 하드코딩
- **증상**: 거래 상태, 정산 상태가 문자열 리터럴로 산재. 다른 모듈의 상태 Enum과 동기화 보장 없음
- **영향**: 오타 시 집계 누락 (KPI 수치 오류). 상태값 변경 시 대시보드만 누락될 위험
- **수정안**: shared 패키지 또는 constants에서 `TRANSACTION_STATUS`, `SETTLEMENT_STATUS` import하여 사용

### H-2. 날짜 범위 교차 검증 부재
- **위치**: `dto/dashboard-query.dto.ts`
- **증상**: `startDate`와 `endDate` 독립 검증. `startDate > endDate` 검증 없음. 최대 범위 제한 없음
- **영향**: 365일치 이상 집계 쿼리 시 DB 부하. 잘못된 날짜 범위로 빈 결과 반환
- **수정안**: 커스텀 밸리데이터로 `startDate <= endDate` + 최대 90일 범위 제한

### H-3. getDailyTrend 30일 기본값 하드코딩
- **위치**: `dashboard.service.ts` — `getDailyTrend()` 메서드
- **증상**: 날짜 미지정 시 30일 기본값이 서비스 내부에 하드코딩. 변경 시 코드 수정 필요
- **영향**: OST 원칙 위반. 기본 기간 변경 시 여러 곳 수정 위험
- **수정안**: `DEFAULT_TREND_DAYS = 30` 상수 분리

### H-4. Swagger 응답 타입 미상세
- **위치**: `dashboard.controller.ts` 전체 6개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움
- **수정안**: `DashboardSummaryDto`, `TransactionStatsDto` 등 응답 DTO 정의 + `@ApiResponse({ type })` 추가

### H-5. E2E 테스트 부재
- **위치**: 테스트 디렉토리
- **증상**: 단위 테스트 12건 있으나 E2E 테스트 0건. 다른 모듈은 E2E 테스트 존재
- **영향**: 인증+권한+데이터격리 통합 검증 불가. OwnershipInterceptor 실제 동작 미검증
- **수정안**: E2E 테스트 추가 — 가맹점 로그인 후 자기 데이터만 조회 확인

---

## MEDIUM (다음 Sprint 수정)

### M-1. 대량 데이터 성능 테스트 부재
- **위치**: `__tests__/dashboard.service.spec.ts`
- **증상**: 소량 Mock 데이터로만 테스트. 1만건+ 거래 시 집계 성능 미검증
- **영향**: 프로덕션 데이터 규모에서 응답 지연 가능성 미확인
- **수정안**: 성능 벤치마크 테스트 또는 쿼리 실행 계획(EXPLAIN) 검증

### M-2. 캐싱 전략 부재
- **위치**: `dashboard.service.ts` 전체
- **증상**: 모든 요청마다 8개 KPI를 실시간 집계. 캐싱 없음
- **영향**: 동시 접속 시 DB 부하 집중. 대시보드는 실시간성보다 근사치가 중요한 경우 많음
- **수정안**: Redis 또는 인메모리 캐시 (TTL 5분) 적용 고려

### M-3. BigInt→string 변환 일관성 테스트 부재
- **위치**: `__tests__/dashboard.service.spec.ts`
- **증상**: BigInt Mock 값 사용하나, 실제 BigInt→string 직렬화 검증 미흡
- **영향**: API 응답에서 BigInt 직렬화 오류 가능성 미검증
- **수정안**: 응답 직렬화 포함 통합 테스트 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **$transaction 8개 병렬 KPI** | 단일 트랜잭션 내에서 8개 집계 쿼리 실행 → 데이터 일관성 보장 |
| **Prisma.sql 템플릿** | Raw SQL 사용 시 `Prisma.sql` 태그드 리터럴 → SQL 인젝션 방지 |
| **merchantMap/agentMap** | 가맹점·대리점 이름 조회를 Map으로 캐싱 → N+1 문제 방지 |
| **OwnershipInterceptor** | 컨트롤러 레벨에서 데이터 격리 적용 |
| **BigInt 일관성** | 모든 금액 필드 BigInt 처리 후 string 변환 |
| **읽기 전용 설계** | module.exports 없음 — 다른 모듈에 의존성 없는 순수 조회 모듈 |
| **단위 테스트 12건** | 6개 메서드 × 2(정상+엣지) 커버리지 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 2h | 서비스 쿼리 조건 추가 |
| 2 | H-1 | 0.5h | shared 상수 import |
| 3 | H-2 | 0.5h | 없음 (DTO 밸리데이터) |
| 4 | H-3 | 0.5h | 없음 (상수 분리) |
| 5 | H-4 | 1h | 없음 (DTO + Swagger) |
| 6 | H-5 | 2h | 테스트 |
| 7 | M-1~M-3 | 2h | 테스트 + 캐시 |

> C-1(데이터 격리)은 가맹점/대리점별 KPI 정확성에 필수. H-1(매직 스트링)은 OST 원칙 위반
