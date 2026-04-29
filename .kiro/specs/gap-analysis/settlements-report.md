# Settlements 모듈 Gap Report (4/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (81/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A- | 82 |
| 컨트롤러/DTO/스케줄러 | B+ | 78 |
| 테스트 커버리지 | B+ | 82 (추정 72%) |
| 아키텍처/의존성 | A- | 82 |

---

## CRITICAL (즉시 수정 필요)

### C-1. 정산 계산 Race Condition — 중복 정산 위험
- **위치**: `settlements.service.ts` — `calculate()` 메서드
- **증상**: 중복 정산일 체크(`settlements.count`)가 트랜잭션 외부에서 수행됨. check-then-act 사이에 다른 요청이 중복 생성 가능
- **영향**: 정산 데이터 중복 → 가맹점 이중 지급. 금융 데이터 무결성 위반
- **수정안**: 중복 체크를 `$transaction({ isolationLevel: 'Serializable' })` 내부로 이동 + DB UNIQUE 제약 `(merchant_id, settlement_date)` 추가

### C-2. 금액 음수/오버플로우 검증 부재
- **위치**: `settlements.service.ts` line 216-218, `settlement-scheduler.service.ts` line 168-170
- **증상**: `totalFee > totalAmount` 시 음수 정산금 발생 가능. BigInt 계산 후 유효성 검사 없음
- **영향**: 음수 정산금 DB 저장 → 가맹점에 빌려주기 상황. PCI DSS 금융 정확성 위반
- **수정안**: `if (totalFee > totalAmount) throw BadRequestException` + `if (totalNet < BigInt(0))` 가드 추가

### C-3. 대리점 정산 중복 생성 가능
- **위치**: `settlement-scheduler.service.ts` — `processOneMerchant()` 내 agent_settlements 생성
- **증상**: 동일 대리점의 여러 가맹점이 같은 settlementDate에 대해 agent_settlement를 N번 생성
- **영향**: 대리점 수수료 N배 과다 지급
- **수정안**: DB UNIQUE 제약 `(agent_id, settlement_date)` 추가 + 대리점별 그룹화 후 1회 생성

### C-4. 감사 로그 Fire-and-Forget — PCI DSS 위반
- **위치**: `settlement-auto-execution.service.ts` line 79-94, 186-202, 249-264
- **증상**: `writeAuditLog().catch()` 패턴으로 감사 로그 실패 무시. 고부하 시 audit trail 손실
- **영향**: PCI DSS 10.2.2 위반 — 정산 처리 기록 누락, 금융감독 추적 불가
- **수정안**: 감사 로그를 메인 트랜잭션에 포함 (실패 시 정산 롤백) 또는 비동기 큐(Redis) 재시도

### C-5. CalculateSettlementDto 날짜 범위 검증 부재
- **위치**: `dto/calculate-settlement.dto.ts`
- **증상**: `periodFrom > periodTo` 검증 없음, 미래 날짜 입력 제한 없음, settlementDate와 기간 불일치 검증 없음
- **영향**: 부정확한 정산 계산, 데이터 무결성 훼손
- **수정안**: `periodFrom <= periodTo <= today` 커스텀 밸리데이터 + `settlementDate` 기간 내 검증

---

## HIGH (Sprint 내 수정 권장)

### H-1. 스케줄러 다중 인스턴스 동시 실행 방지 미흡
- **위치**: `settlement-scheduler.service.ts` — 4개 @Cron 데코레이터
- **증상**: 분산 락 없음. K8s 다중 Pod 배포 시 동일 Cron이 모든 인스턴스에서 동시 실행
- **영향**: 중복 정산, 중복 송금, 자금 이중 지급
- **수정안**: Redis 기반 분산 락 또는 PostgreSQL advisory lock

### H-2. 상태 전이 검증 미흡 — 상태 머신 부재
- **위치**: `settlements.service.ts` confirm/complete, `settlement-auto-execution.service.ts` 전체
- **증상**: 상태 전이 로직이 4개 파일에 산재. 중간 상태 스킵 가능 (CALCULATED → REMITTED 직접 전환)
- **영향**: 미확정 정산 송금, 워크플로우 무시
- **수정안**: `validTransitions` 맵 기반 상태 머신 구현. `where` 절에 현재 상태 조건 추가

### H-3. 부분 실패 재시도 메커니즘 없음
- **위치**: `settlement-scheduler.service.ts` line 71-119 배치 루프
- **증상**: 가맹점별 실패 시 기록만 남기고 재시도 로직 없음. 다음 배치까지 방치
- **영향**: 특정 가맹점 정산 영구 누락 가능
- **수정안**: `settlement_retries` 테이블 + 별도 재시도 배치 추가

### H-4. 은행 계좌 정보 평문 전달
- **위치**: `settlement-auto-execution.service.ts` line 157-163
- **증상**: `merchant.bank_account` 평문 그대로 Banking API에 전달. DB 저장도 평문 추정
- **영향**: PCI DSS 3.4 위반 — 계좌 정보 암호화 필수
- **수정안**: merchants 테이블 bank_account 암호화 저장 → 조회 시 KMS로 복호화

### H-5. AgentSettlementQueryDto status 검증 부실
- **위치**: `dto/agent-settlement-query.dto.ts` line 34-37
- **증상**: `@IsString()` 만 사용. `SettlementListQueryDto`는 `@IsEnum(SETTLEMENT_STATUS)` 사용 — 일관성 부족
- **영향**: 유효하지 않은 상태값 파이프라인 통과
- **수정안**: `@IsEnum(SETTLEMENT_STATUS)` 로 통일

### H-6. Cron 시간대 명시 부족
- **위치**: `settlement-scheduler.service.ts` line 44-48
- **증상**: `@Cron('0 2 * * *')` — UTC/KST 명시 없음
- **영향**: 시간대 오류 시 정산 시간 밀림, 거래 기간 불일치
- **수정안**: `@Cron('0 2 * * *', { timeZone: 'Asia/Seoul' })` 명시

### H-7. Swagger 응답 타입 미상세
- **위치**: `settlements.controller.ts` 전체
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시. 응답 스키마 Swagger UI 미표시
- **영향**: 클라이언트 구현 어려움, API 문서 불완전
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: SettlementResponseDto })` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. Banking API Mock 상태 (서비스 출시 불가)
- **위치**: `banking-api.service.ts` line 49-71
- **증상**: 은행 송금이 항상 성공 반환. 실제 오픈뱅킹 미연동
- **영향**: 실 자금 이동 불가. Mock/Real 모드 전환 설정 없음
- **수정안**: 오픈뱅킹 API 연동 + REMIT_FAILED 상태 추가 + 송금 실패 재시도 로직

### M-2. 설정값 하드코딩
- **위치**: `settlement-auto-execution.service.ts` (maxCount=100 등)
- **증상**: 배치 크기, 타임아웃 등이 상수 고정. 환경별 튜닝 불가
- **수정안**: `SETTLEMENT_CONFIG` 환경변수로 분리

### M-3. MONTHLY 날짜 계산 Edge Case
- **위치**: `settlement-scheduler.service.ts` line 281-285 `calculatePeriod()`
- **증상**: `base.getUTCMonth() - 1`이 1월에서 음수 → 연도 조정 필요
- **영향**: 1월 1일 실행 시 NaN 또는 잘못된 날짜 가능
- **수정안**: `Date.setUTCMonth(month - 1)` 패턴으로 자동 연도 보정

### M-4. Period 계산 타임존 혼동
- **위치**: `settlement-scheduler.service.ts` line 244-293
- **증상**: UTC 기반 계산이지만 한국 비즈니스 시간 개념과 혼동 가능 (UTC 자정 = KST 09:00)
- **영향**: 전날 거래가 포함되는 경계값 오류 가능성
- **수정안**: 타임존 명시적 변환 (`Asia/Seoul` 기반)

### M-5. N+1 쿼리 — processOneMerchant에서 merchant 재조회
- **위치**: `settlement-scheduler.service.ts` line 175
- **증상**: 가맹점 목록 조회 후 processOneMerchant에서 다시 개별 조회
- **영향**: 100 가맹점 기준 100회 추가 쿼리 (미미하나 개선 가능)
- **수정안**: merchantMap 메모리 캐시로 전환

### M-6. 동시성 + 보안 테스트 부재
- **위치**: 테스트 전반
- **증상**: Race condition 방지 테스트 0건, 보안/권한 위반 테스트 0건, BigInt 경계값 테스트 부족
- **영향**: 금융 시스템 핵심 시나리오 회귀 검증 불가
- **수정안**: 동시성 테스트 (Promise.all 패턴) + 보안 테스트 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **4서비스 SRP** | CRUD/스케줄러/자동실행/은행API 각각 단일 책임. 테스트·확장 용이 |
| **BigInt 일관성** | 모든 금액 필드 BigInt 사용, DTO 변환 시 number 직렬화 |
| **원자적 트랜잭션** | settlements + agent_settlements를 $transaction으로 동시 생성 |
| **시간 기반 상태 머신** | CALCULATED→CONFIRMED→REMITTED→COMPLETED 4단계 자동화 |
| **유연한 정산 주기** | D+1/D+2/D+3/WEEKLY/MONTHLY 동적 계산 |
| **가맹점별 격리** | 1개 가맹점 실패 → 나머지 배치 계속 진행 |
| **모듈 경계 명확** | 순환 의존성 없음, SecurityModule만 단일 외부 의존 |
| **감사 추적 기초** | created_by/updated_by + AUDIT_ACTIONS 정의 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 + C-3 | 3h | DB 스키마 (UNIQUE 제약) |
| 2 | C-2 | 1h | 없음 |
| 3 | C-4 | 2h | 없음 (Security 모듈 H-1과 연관) |
| 4 | C-5 | 1h | 없음 |
| 5 | H-1 | 3h | Redis 또는 리더 선출 |
| 6 | H-2 | 2h | 없음 |
| 7 | H-3 + H-4 | 4h | DB 스키마 + KMS |
| 8 | H-5 + H-6 + H-7 | 1.5h | 없음 |
| 9 | M-1 | 40h+ | 오픈뱅킹 계약 (서비스 출시 전) |

> C-1~C-5는 금융 정확성/PCI DSS 필수. H-1(분산 락)은 다중 인스턴스 배포 전 필수
