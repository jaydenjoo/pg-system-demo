# Merchants 모듈 Gap Report (7/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (78/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 78 |
| 컨트롤러/DTO | B+ | 80 |
| 테스트 커버리지 | B | 75 |
| 아키텍처/의존성 | B+ | 79 |

---

## CRITICAL (즉시 수정 필요)

### C-1. generateMerchantCode() Race Condition — 중복 가맹점 코드 생성
- **위치**: `merchants.service.ts` line 121-133
- **증상**: `count()` 쿼리로 시퀀스 번호 생성 후 `create()`까지 트랜잭션 없이 수행됨. 동시 가맹점 등록 시 동일 코드 생성 가능
- **영향**: 가맹점 식별 불가, 정산·수수료·조회 혼란. DB UNIQUE 제약 없으면 중복 저장
- **수정안**: `$transaction({ isolationLevel: 'Serializable' })` 내부에서 count+create 원자적 처리 + DB UNIQUE 제약 `(merchant_code)` 추가

### C-2. 감사 로그 미연동 — 가맹점 CRUD 변경 추적 누락
- **위치**: `merchants.service.ts` — `create()`, `update()`, `changeStatus()`, `remove()` 전체
- **증상**: 가맹점 생성·수정·상태변경·삭제 시 `audit_logs` 테이블에 기록하지 않음
- **영향**: PCI DSS 10.2.2 "금융 관련 데이터 변경 이력 기록" 미충족. 가맹점 계약 변경 분쟁 시 증거 부재
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 생성/수정/상태변경/삭제 시점에 변경 전후값 감사 기록

### C-3. bank_account 평문 저장 — PCI DSS 위반
- **위치**: `merchants.service.ts` — `create()`, `update()` 메서드
- **증상**: 은행 계좌번호가 DB에 평문 저장. 조회 시 `maskBankAccount()`로 마스킹하나 DB 자체는 평문
- **영향**: PCI DSS 3.4 위반 — DB 유출 시 전체 가맹점 계좌 노출. 정산 자동 송금과 결합 시 자금 탈취 위험
- **수정안**: 저장 시 KMS 암호화 → 조회 시 복호화+마스킹. SecurityModule의 KmsService 활용

---

## HIGH (Sprint 내 수정 권장)

### H-1. 상태 전이 검증 부재 — 임의 상태 변경 가능
- **위치**: `merchants.service.ts` — `changeStatus()` 메서드
- **증상**: 현재 상태와 무관하게 어떤 상태로든 변경 가능. SUSPENDED→ACTIVE, TERMINATED→ACTIVE 등 비정상 전이 허용
- **영향**: 해지된 가맹점 재활성화, 정산 대상에 비정상 가맹점 포함
- **수정안**: `validTransitions` 맵 기반 상태 머신 구현. `PENDING→ACTIVE→SUSPENDED→TERMINATED` 등 허용 경로만 인정

### H-2. businessNo 형식 검증 부재
- **위치**: `dto/create-merchant.dto.ts`
- **증상**: `@IsString()` + `@MaxLength(20)` 만 적용. 한국 사업자등록번호 형식(XXX-XX-XXXXX, 10자리) 검증 없음
- **영향**: 비정상 사업자등록번호 저장, 세금계산서 연동 시 오류, 가맹점 실체 검증 불가
- **수정안**: `@Matches(/^\d{3}-\d{2}-\d{5}$/)` 정규식 추가 또는 사업자등록번호 체크디짓 검증

### H-3. 계약 날짜 교차 검증 부재
- **위치**: `dto/create-merchant.dto.ts`
- **증상**: `contractStartDate`와 `contractEndDate` 독립 검증. `startDate > endDate` 검증 없음
- **영향**: 종료일이 시작일보다 이른 계약 생성 가능. 정산 기간 계산 오류
- **수정안**: 커스텀 밸리데이터로 `contractStartDate <= contractEndDate` + 최소 계약 기간(30일) 검증

### H-4. update/changeStatus/remove check-then-act 패턴
- **위치**: `merchants.service.ts` — `update()` line 157, `changeStatus()` line 175, `remove()` line 192
- **증상**: `findOne()` 조회 후 별도 `update()` 호출. 두 쿼리 사이에 다른 요청이 상태 변경 가능
- **영향**: 이미 해지된 가맹점 재수정, 동시 삭제 요청 시 이중 처리
- **수정안**: `update({ where: { id, deleted_at: null } })` 조건부 업데이트 또는 트랜잭션 래핑

### H-5. Swagger 응답 타입 미상세
- **위치**: `merchants.controller.ts` 전체 6개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움, 코드 자동생성 불가
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: MerchantResponseDto })` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. search 필드 MaxLength 미제한
- **위치**: `dto/merchant-list-query.dto.ts`
- **증상**: `search` 필드에 길이 제한 없음. 매우 긴 검색어로 LIKE 쿼리 부하 유발 가능
- **영향**: DB 성능 저하 (LIKE '%매우긴문자열%' 풀스캔)
- **수정안**: `@MaxLength(100)` 추가

### M-2. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 가맹점 생성(코드 충돌), 동시 상태 변경 시나리오 0건
- **영향**: Race condition(C-1) 재현 테스트 없음
- **수정안**: `Promise.all` 기반 동시 생성 테스트 추가

### M-3. 상태 전이 검증 테스트 부재
- **위치**: `__tests__/merchants.service.spec.ts`
- **증상**: changeStatus 테스트에서 유효하지 않은 전이(TERMINATED→ACTIVE) 검증 없음
- **영향**: H-1 수정 후 회귀 검증 불가
- **수정안**: 허용/비허용 상태 전이 매트릭스 테스트 추가

### M-4. 계약 날짜 교차 검증 테스트 부재
- **위치**: `__tests__/merchants.service.spec.ts`, E2E 테스트
- **증상**: contractStartDate > contractEndDate 시나리오 미검증
- **영향**: H-3 수정 후 회귀 검증 불가
- **수정안**: 잘못된 날짜 범위 입력 → 에러 반환 테스트 추가

### M-5. soft delete 후 조회 격리 테스트 부재
- **위치**: `__tests__/merchants.service.spec.ts`
- **증상**: 삭제된 가맹점이 findAll에서 제외되는지 검증 없음
- **영향**: soft delete 로직 변경 시 삭제된 가맹점 노출 가능성 미검증
- **수정안**: remove → findAll에서 미포함 검증 테스트 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **OwnershipInterceptor** | 가맹점별 데이터 격리 자동 적용 |
| **원자적 생성** | companies + merchants 테이블을 $transaction으로 동시 생성 |
| **자동 코드 생성** | M + YYYYMMDD + sequence 패턴으로 가독성 높은 가맹점 코드 |
| **은행 계좌 마스킹** | 조회 시 maskBankAccount()로 중간 자릿수 마스킹 |
| **Soft Delete** | 물리 삭제 없이 deleted_at 필드로 논리 삭제 |
| **ParseUUIDPipe** | 모든 ID 파라미터에 UUID 형식 검증 |
| **세분화된 권한** | MERCHANT_READ/CREATE/UPDATE/DELETE 4단계 |
| **E2E 전체 플로우** | 생성→중복→검증→조회→수정→상태변경→삭제 15개 시나리오 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1.5h | DB 스키마 (UNIQUE 제약) |
| 2 | C-3 | 3h | SecurityModule KmsService |
| 3 | C-2 | 2h | SecurityModule 연동 |
| 4 | H-1 | 1.5h | 없음 |
| 5 | H-2 + H-3 | 1h | 없음 |
| 6 | H-4 | 1.5h | 없음 |
| 7 | H-5 | 1h | 없음 |
| 8 | M-1 | 0.5h | 없음 |
| 9 | M-2~M-5 | 2h | 테스트 |

> C-1(코드 충돌)은 운영 안정성 필수. C-3(계좌 암호화)은 PCI DSS 감사 대비 필수
