# Transactions 모듈 Gap Report (6/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (79/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 80 |
| 컨트롤러/DTO | B | 76 |
| 테스트 커버리지 | B+ | 82 |
| 아키텍처/의존성 | B+ | 78 |

---

## CRITICAL (즉시 수정 필요)

### C-1. 취소(cancel) 처리 Race Condition
- **위치**: `transactions.service.ts` line 231-261
- **증상**: 상태 조회(`findUnique`)와 상태 변경(`update`)이 트랜잭션 없이 수행됨. 동시 취소 요청 시 이중 취소 가능
- **영향**: 이중 환불 → PG 손실. 금융 데이터 무결성 위반
- **수정안**: `$transaction({ isolationLevel: 'Serializable' })` 내부에서 조회+검증+업데이트 원자적 처리. `where` 절에 현재 상태 조건 추가

### C-2. 거래번호(tran_no) 충돌 위험
- **위치**: `transactions.service.ts` line 204
- **증상**: `Date.now()` 기반 거래번호 생성. 밀리초 단위 동시 요청 시 중복 가능
- **영향**: 거래 식별 불가, 정산·조회·취소 혼란. DB UNIQUE 제약 없으면 중복 저장
- **수정안**: UUID v7 (시간 정렬 가능) 또는 `{prefix}-{timestamp}-{random}` 패턴. DB에 UNIQUE 제약 추가

### C-3. 감사 로그 미연동 — 금융 거래 변경 추적 누락
- **위치**: `transactions.service.ts` — `create()`, `cancel()` 메서드
- **증상**: 거래 생성·취소 시 `audit_logs` 테이블에 기록하지 않음
- **영향**: PCI DSS 10.2.2 "금융 거래 이력 기록" 미충족. 분쟁 발생 시 증거 부재
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 거래 생성/취소/상태변경 시점에 감사 기록

---

## HIGH (Sprint 내 수정 권장)

### H-1. 거래 금액 상한 검증 부재
- **위치**: `dto/create-transaction.dto.ts`
- **증상**: `@Min(100)` 만 존재. 상한 없음. `999999999999` 등 비현실적 금액 허용
- **영향**: 비정상 거래 생성, 정산 시 오버플로우 위험 (BigInt 변환 시)
- **수정안**: `@Max(100_000_000)` (1억원) 또는 결제수단별 상한 설정. 한국 PG 업계 기준 카드 5천만, 계좌이체 1억

### H-2. transactionType / paymentMethod 자유 입력
- **위치**: `dto/create-transaction.dto.ts`
- **증상**: `@IsString()` + `@MaxLength()` 만 적용. Enum 미사용
- **영향**: "CARDD", "bank_transfer" 등 오타/비표준 값 저장. 통계·정산·캐시 키 파편화
- **수정안**: `@IsEnum(TRANSACTION_TYPES)`, `@IsEnum(PAYMENT_METHODS)` 적용. shared 패키지에 Enum 정의

### H-3. 날짜 범위 교차 검증 부재
- **위치**: `dto/transaction-list-query.dto.ts`
- **증상**: `startDate`와 `endDate` 독립 검증. `startDate > endDate` 검증 없음, 한쪽만 입력 시 무시
- **영향**: 빈 결과 반환으로 클라이언트 혼란. 90일치 이상 쿼리로 DB 부하 가능
- **수정안**: 커스텀 밸리데이터로 `startDate <= endDate` + 최대 90일 범위 제한

### H-4. 부분 취소 미지원
- **위치**: `transactions.service.ts` — `cancel()` 메서드
- **증상**: 전액 취소만 가능. 부분 취소(partial refund) 로직 없음
- **영향**: 배송비 제외 환불, 쿠폰 차감 환불 등 실무 시나리오 미대응
- **수정안**: `cancel_amount` 필드 추가 + 누적 취소금액 ≤ 원거래금액 검증

### H-5. Swagger 응답 타입 미상세
- **위치**: `transactions.controller.ts` 전체 4개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움, 코드 자동생성 불가
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: TransactionResponseDto })` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. VAT 계산 로직 서비스 내 하드코딩
- **위치**: `transactions.service.ts` line 194
- **증상**: VAT 계산이 서비스 내부에 직접 구현. 세율 변경 시 코드 수정 필요
- **영향**: 세율 변경(현재 10%) 시 여러 곳 수정 필요. OST 위반
- **수정안**: `TAX_RATE` 상수 분리 또는 `PgFeeCalculatorService` 통합

### M-2. findAll 페이지네이션 최대값 미제한
- **위치**: `dto/transaction-list-query.dto.ts`
- **증상**: `@Max(100)` limit 제한 있으나, page 번호 상한 없음. `page=999999` 시 대량 offset 쿼리
- **영향**: DB 성능 저하 (offset 기반 페이지네이션의 고질적 문제)
- **수정안**: cursor 기반 페이지네이션 전환 또는 `page * limit <= 10000` 상한

### M-3. 취소 사유 구조화 부재
- **위치**: `dto/cancel-transaction.dto.ts`
- **증상**: `reason` 필드가 자유 텍스트. 취소 유형(고객 요청/상품 불량/오결제 등) 분류 없음
- **영향**: 취소 통계·분석 어려움, CS 대응 시 카테고리 필터링 불가
- **수정안**: `cancelType` Enum 추가 + `reason` 상세 사유 유지

### M-4. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 취소 요청, 동시 생성 요청 시나리오 0건. Race condition(C-1) 재현 테스트 없음
- **영향**: 핵심 금융 버그 회귀 검증 불가
- **수정안**: `Promise.all` 기반 동시 취소 테스트 추가

### M-5. merchantId 기반 격리 테스트 부재
- **위치**: `__tests__/transactions.service.spec.ts`
- **증상**: 가맹점 간 데이터 격리 검증 없음. 가맹점 A가 가맹점 B 거래 조회/취소 시도 테스트 없음
- **영향**: 가맹점 데이터 유출 가능성 미검증
- **수정안**: 다른 merchantId로 조회/취소 시도 → 에러 또는 빈 결과 검증

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **BigInt 금액 처리** | 모든 금액 필드 BigInt, VAT 계산도 BigInt로 정밀 처리 |
| **상태 기반 취소 검증** | APPROVED 상태만 취소 가능, 이미 취소/만료 건 거부 |
| **OwnershipInterceptor** | 가맹점별 데이터 격리 자동 적용 |
| **페이지네이션** | skip/take 기반 + 총 개수 반환 |
| **Enum 상태 필터** | TransactionListQueryDto에 `@IsEnum(TRANSACTION_STATUS)` 적용 |
| **E2E 테스트** | 10개 시나리오로 생성→조회→취소 전체 플로우 검증 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1.5h | 없음 (트랜잭션 래핑) |
| 2 | C-2 | 1h | DB 스키마 (UNIQUE 제약) |
| 3 | C-3 | 2h | SecurityModule 연동 |
| 4 | H-1 + H-2 | 1h | shared 패키지 Enum |
| 5 | H-3 | 0.5h | 없음 |
| 6 | H-4 | 4h | DB 스키마 (cancel_amount 필드) |
| 7 | H-5 | 1h | 없음 |
| 8 | M-1 + M-3 | 1.5h | 없음 |
| 9 | M-4 + M-5 | 2h | 테스트 |

> C-1(이중 취소)은 금융 정합성 필수. C-2(거래번호)는 운영 안정성 필수
