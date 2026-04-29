# Commissions 모듈 Gap Report (5/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (81/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A- | 84 |
| 컨트롤러/DTO | B+ | 79 |
| 테스트 커버리지 | B | 75 |
| 아키텍처/의존성 | A- | 86 |

---

## CRITICAL (즉시 수정 필요)

### C-1. 수수료 계층 검증 Race Condition — setAgentCommission
- **위치**: `commissions.service.ts` line 194-236
- **증상**: PG 마진 조회(`findFirst`)가 트랜잭션 **외부**에서 수행됨. check-then-act 사이에 다른 요청이 PG 마진을 변경하면 유효하지 않은 수수료가 설정됨
- **영향**: 수수료 계층 무결성 파괴 — 대리점 수수료 < PG 마진인 상태가 DB에 저장 가능. 정산 시 PG 손실 발생
- **수정안**: 계층 검증 쿼리를 `$transaction({ isolationLevel: 'Serializable' })` 내부로 이동

### C-2. 수수료 계층 검증 Race Condition — setMerchantCommission
- **위치**: `commissions.service.ts` line 321-364
- **증상**: 대리점 수수료 조회(`findFirst`)가 트랜잭션 **외부**에서 수행됨. C-1과 동일한 패턴
- **영향**: 가맹점 수수료 < 대리점 수수료 상태 가능. 대리점 마진 역전
- **수정안**: C-1과 동일 — 전체 검증+생성을 하나의 직렬화 트랜잭션으로 묶기

### C-3. PG 마진 변경 시 하위 계층 정합성 미검증
- **위치**: `commissions.service.ts` — `setPgMargin()` line 89-118
- **증상**: PG 마진을 올려도 기존 대리점 수수료가 새 PG 마진보다 낮은지 검증하지 않음
- **영향**: PG 마진 3% → 5% 변경 시 대리점 수수료 4%인 경우 계층 역전. 정산 시 PG 손실
- **수정안**: `setPgMargin` 시 해당 결제수단의 모든 활성 대리점 수수료가 새 마진 이상인지 검증. 위반 건 있으면 에러 반환 또는 경고 목록 반환

---

## HIGH (Sprint 내 수정 권장)

### H-1. 수수료율 범위 검증 부재 (0%~100%)
- **위치**: `dto/set-pg-margin.dto.ts`, `dto/set-agent-commission.dto.ts`, `dto/set-merchant-commission.dto.ts`
- **증상**: `marginRate`/`commissionRate`가 `^\d+(\.\d{1,4})?$` 정규식만 적용. "0", "99.9999", "999" 모두 통과
- **영향**: 0% 수수료 설정 시 PG 수익 없음, 100% 초과 시 가맹점에서 역청구 상황
- **수정안**: 커스텀 밸리데이터로 `0.01 <= rate <= 30.0000` 범위 제한 (한국 PG 업계 상한 ~30%)

### H-2. entityType 파라미터 검증 부재
- **위치**: `commissions.controller.ts` line 200
- **증상**: `@Param("entityType") entityType: "agent" | "merchant"` — TypeScript 타입만 존재, 런타임 검증 없음
- **영향**: `"admin"` 등 유효하지 않은 값 입력 시 빈 결과 반환(에러 아님) → 클라이언트 혼란
- **수정안**: `ParseEnumPipe` 또는 커스텀 ValidationPipe로 런타임 검증 추가

### H-3. Swagger 응답 타입 미상세
- **위치**: `commissions.controller.ts` 전체 7개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시. 응답 스키마 Swagger UI 미표시
- **영향**: API 소비자가 응답 구조 파악 어려움, 코드 자동생성 불가
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: CommissionResponseDto })` 추가

### H-4. 감사 로그 미연동 — 금융 데이터 변경 추적 누락
- **위치**: `commissions.service.ts` 전체 set* 메서드
- **증상**: 수수료 변경 시 `audit_logs` 테이블에 기록하지 않음. `effective_from/to` 버전 관리는 있으나 "누가 왜" 변경했는지 감사 추적 없음
- **영향**: PCI DSS 10.2.2 "금융 계산 변경 이력 기록" 부분 미충족. `created_by`만으로는 불충분 (변경 사유, IP, 이전값 미기록)
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 변경 전후값 + 변경 사유 기록

### H-5. 캐시 무효화 범위 불완전
- **위치**: `commissions.service.ts` — `setAgentCommission()` line 238-239
- **증상**: 대리점 수수료 변경 시 해당 대리점 캐시만 삭제. 해당 대리점 소속 가맹점의 캐시는 무효화하지 않음
- **영향**: 가맹점 수수료 조회 시 이전 대리점 수수료 기반의 stale 캐시 반환 가능
- **수정안**: 대리점 수수료 변경 시 소속 가맹점 캐시도 함께 무효화, 또는 캐시 TTL 단축

---

## MEDIUM (다음 Sprint 수정)

### M-1. 소수점 비교 시 부동소수점 정밀도 위험
- **위치**: `commissions.service.ts` line 203-205, 331-333
- **증상**: `Number(pgMargin.margin_rate)` vs `Number(dto.commissionRate)` 비교. `"2.1000"` → `2.1` 변환 시 IEEE 754 부동소수점 오차 가능
- **영향**: 경계값(정확히 같은 수수료율)에서 예기치 않은 검증 실패
- **수정안**: `parseFloat` 대신 `Decimal` 라이브러리 또는 정수 비교 (`rate * 10000`)

### M-2. 캐시 히트 테스트 부재
- **위치**: `__tests__/commissions.service.spec.ts`
- **증상**: 모든 테스트에서 `mockCache.get` → `undefined`. 캐시 적중 시 DB 조회 스킵 로직 미검증
- **영향**: 캐시 로직 변경 시 회귀 미감지
- **수정안**: 캐시 적중 테스트 추가 — `mockCache.get` → 유효 데이터 반환 시 DB 미호출 검증

### M-3. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 수수료 변경 요청 시나리오 0건. Race condition(C-1, C-2) 재현 테스트 없음
- **영향**: 핵심 금융 버그 회귀 검증 불가
- **수정안**: `Promise.all` 기반 동시 설정 테스트 추가

### M-4. paymentMethod 자유 입력 — Enum 미적용
- **위치**: 전체 DTO — `paymentMethod` 필드
- **증상**: `@IsString()` + `@MaxLength()` 만 적용. "CARD", "BANK", "VIRTUAL_ACCOUNT" 등 유효 값 제한 없음
- **영향**: 오타나 비표준 결제수단 입력 시 dead 레코드 생성, 캐시 키 파편화
- **수정안**: `@IsEnum(PAYMENT_METHODS)` 또는 허용 목록 제한

### M-5. 경계값 테스트 부재
- **위치**: `__tests__/commissions.service.spec.ts`
- **증상**: 0% 수수료, 동일 수수료율(PG=대리점=가맹점), 극단적 소수점(0.0001) 테스트 없음
- **영향**: 경계 조건에서 예기치 않은 동작 미검증
- **수정안**: 경계값 + 동일값 + 극단값 테스트 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **3단계 수수료 계층** | PG 마진 → 대리점 → 가맹점 명확한 계층 구조, 하향식 검증 |
| **Expire-and-Create 패턴** | 이전 수수료 만료 + 신규 생성을 트랜잭션으로 원자적 처리 |
| **버전 관리** | effective_from/to로 수수료 변경 이력 완전 보존. 임의 시점 조회 가능 |
| **캐시 통합** | CACHE_MANAGER + CACHE_TTL 공유 상수로 성능 최적화 |
| **OwnershipInterceptor** | 대리점/가맹점 수수료 조회 시 소유권 검증 자동 적용 |
| **ParseUUIDPipe** | 모든 ID 파라미터에 UUID 형식 검증 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |
| **E2E 전체 플로우** | PG 마진→대리점→가맹점→이력 순서 E2E 검증 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 + C-2 | 2h | 없음 (트랜잭션 내부로 이동) |
| 2 | C-3 | 2h | 없음 |
| 3 | H-1 | 1h | 없음 |
| 4 | H-2 | 0.5h | 없음 |
| 5 | H-4 | 2h | SecurityModule 연동 |
| 6 | H-3 + H-5 | 1.5h | 없음 |
| 7 | M-1 | 1h | 없음 |
| 8 | M-2 + M-3 + M-5 | 2h | 테스트 |
| 9 | M-4 | 1h | shared 패키지 PAYMENT_METHODS enum |

> C-1~C-3은 금융 정합성 필수. H-4(감사 로그)는 PCI DSS 감사 대비 필요
