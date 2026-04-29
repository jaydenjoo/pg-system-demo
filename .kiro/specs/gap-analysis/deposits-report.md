# Deposits 모듈 Gap Report (9/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B (76/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 78 |
| 컨트롤러/DTO | B | 74 |
| 테스트 커버리지 | B | 75 |
| 아키텍처/의존성 | B | 77 |

---

## CRITICAL (즉시 수정 필요)

### C-1. reconcile() check-then-act — 입금 상태 변경 Race Condition
- **위치**: `deposits.service.ts` — `reconcile()` 메서드
- **증상**: `findOne(id)` 조회가 트랜잭션 외부에서 수행됨. 조회 후 트랜잭션 내에서 매칭 처리하기까지 사이에 다른 요청이 동일 입금 건을 중복 매칭 가능
- **영향**: 하나의 입금에 여러 거래가 매칭 → 이중 정산. 금융 데이터 무결성 위반
- **수정안**: `findOne()` 조회를 `$transaction({ isolationLevel: 'Serializable' })` 내부로 이동. `WHERE reconcile_status = 'PENDING'` 조건 추가

### C-2. 감사 로그 미연동 — 입금·매칭 변경 추적 누락
- **위치**: `deposits.service.ts` — `create()`, `reconcile()`, `manualMatch()`, `unmatch()` 전체
- **증상**: JSDoc에 "PCI DSS 10.2 감사 로그" 언급하나 실제 `writeAuditLog()` 호출 없음. 입금 생성·자동매칭·수동매칭·매칭해제 시 기록 없음
- **영향**: PCI DSS 10.2.2 위반 — 금융 거래 매칭 이력 기록 누락. 입금 분쟁 시 증거 부재
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 모든 상태 변경 시점에 변경 전후값 감사 기록

### C-3. reconcile_status 매직 스트링 — 상수/Enum 미사용
- **위치**: `deposits.service.ts` 전체 — `"MATCHED"`, `"MISMATCHED"`, `"MANUAL"`, `"PENDING"` 하드코딩
- **증상**: 상태값이 문자열 리터럴로 산재. 오타 시 런타임 오류 없이 잘못된 상태 저장
- **영향**: 오타("MACHED") → DB 오염, 필터링 누락, 정산 대상 제외. 상태 추가 시 누락 위험
- **수정안**: `RECONCILE_STATUS` enum/상수 정의 → 서비스·DTO 전체에서 사용. OST 원칙 적용

---

## HIGH (Sprint 내 수정 권장)

### H-1. OwnershipInterceptor 미적용 — 데이터 격리 부재
- **위치**: `deposits.controller.ts`
- **증상**: MerchantsController·TransactionsController는 OwnershipInterceptor 적용하나, DepositsController는 미적용
- **영향**: 타 가맹점/대리점의 입금 데이터 조회·매칭 가능. 데이터 격리 위반
- **수정안**: DepositsController에 OwnershipInterceptor 적용 + merchantId 기반 데이터 격리

### H-2. 금액 상한 검증 부재
- **위치**: `dto/create-deposit.dto.ts` — `amount` 필드, `dto/manual-match.dto.ts` — `matchedAmount` 필드
- **증상**: `@Min(1)` 만 존재. 상한 없음. `999999999999` 등 비현실적 금액 허용
- **영향**: 비정상 입금 등록, BigInt 변환 시 오버플로우 위험
- **수정안**: `@Max(10_000_000_000)` (100억원) 또는 비즈니스 기준 상한 설정

### H-3. source 필드 자유 입력 — Enum 미적용
- **위치**: `dto/create-deposit.dto.ts`, `dto/deposit-list-query.dto.ts`
- **증상**: `source` 필드가 `@IsString()` + `@MaxLength()` 만 적용. "BANK_TRANSFER", "VIRTUAL_ACCOUNT" 등 유효 값 제한 없음
- **영향**: 비표준 값 저장, 필터링 누락, 통계 파편화
- **수정안**: `@IsEnum(DEPOSIT_SOURCE)` 적용. shared 패키지에 Enum 정의

### H-4. 날짜 범위 교차 검증 부재
- **위치**: `dto/deposit-list-query.dto.ts`
- **증상**: `startDate`와 `endDate` 독립 검증. `startDate > endDate` 검증 없음
- **영향**: 빈 결과 반환으로 클라이언트 혼란. 대범위 쿼리 시 DB 부하
- **수정안**: 커스텀 밸리데이터로 `startDate <= endDate` + 최대 90일 범위 제한

### H-5. manualMatch 금액 초과 검증 위치
- **위치**: `deposits.service.ts` — `manualMatch()` 메서드
- **증상**: `matchedAmount > deposit.amount` 검증은 서비스에서 수행하나, 트랜잭션 내부가 아닌 외부에서 조회 후 비교
- **영향**: check-then-act 패턴 — 동시 요청 시 금액 초과 매칭 가능
- **수정안**: 금액 검증을 트랜잭션 내부로 이동

### H-6. Swagger 응답 타입 미상세
- **위치**: `deposits.controller.ts` 전체 6개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: DepositResponseDto })` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. 미래 날짜 입금 제한 없음
- **위치**: `dto/create-deposit.dto.ts` — `depositDate` 필드
- **증상**: `@IsDateString()` 만 적용. 미래 날짜 입금 등록 가능
- **영향**: 정산 기간 계산 오류, 아직 발생하지 않은 입금 등록
- **수정안**: `@MaxDate(new Date())` 커스텀 밸리데이터 추가

### M-2. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 reconcile 요청, 동시 manualMatch 요청 시나리오 0건
- **영향**: Race condition(C-1, H-5) 재현 테스트 없음
- **수정안**: `Promise.all` 기반 동시 매칭 테스트 추가

### M-3. BigInt 경계값 테스트 부재
- **위치**: `__tests__/deposits.service.spec.ts`
- **증상**: 극단적 금액(0, 1, MAX_SAFE_INTEGER 초과) 테스트 없음
- **영향**: BigInt 변환 오류 미검증
- **수정안**: 경계값 테스트 추가

### M-4. 이미 매칭된 입금 재처리 테스트 부재
- **위치**: `__tests__/deposits.service.spec.ts`
- **증상**: `reconcile_status = 'MATCHED'` 상태인 입금에 대한 재매칭 시도 검증 없음
- **영향**: 중복 매칭 방지 로직 회귀 검증 불가
- **수정안**: 이미 매칭된 입금 → reconcile 호출 시 에러/스킵 검증 테스트

### M-5. reconcileStatus 쿼리 DTO Enum 미적용
- **위치**: `dto/deposit-list-query.dto.ts` — `reconcileStatus` 필드
- **증상**: `@IsString()` 만 적용. 유효하지 않은 상태값으로 필터링 시 빈 결과 반환(에러 아님)
- **영향**: 클라이언트 혼란, 디버깅 어려움
- **수정안**: `@IsEnum(RECONCILE_STATUS)` 로 변경

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **자동 매칭 알고리즘** | 날짜 기반 거래 조회 + 금액 비교로 자동 매칭/불일치 판정 |
| **수동 매칭/해제** | manualMatch + unmatch로 운영 유연성 확보 |
| **트랜잭션 사용** | reconcile/manualMatch/unmatch 내부 로직은 $transaction으로 원자적 처리 |
| **BigInt 일관성** | 모든 금액 필드 BigInt 사용 |
| **페이지네이션** | skip/take + 총 개수 반환, limit 100 상한 |
| **ParseUUIDPipe** | 모든 ID 파라미터에 UUID 형식 검증 |
| **E2E 전체 플로우** | 생성→검증→목록→상세→자동매칭→수동매칭→매칭해제 포괄 검증 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1.5h | 없음 (트랜잭션 래핑) |
| 2 | C-3 | 1h | shared 패키지 Enum |
| 3 | C-2 | 2h | SecurityModule 연동 |
| 4 | H-1 | 1.5h | OwnershipInterceptor 확장 |
| 5 | H-2 + H-3 | 1h | 없음 |
| 6 | H-4 + H-5 | 1.5h | 없음 |
| 7 | H-6 | 1h | 없음 |
| 8 | M-1~M-5 | 2h | 테스트 + DTO |

> C-1(중복 매칭)은 금융 정합성 필수. C-3(매직 스트링)은 OST 원칙 위반으로 즉시 수정
