# Agents 모듈 Gap Report (8/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (80/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 79 |
| 컨트롤러/DTO | B | 76 |
| 테스트 커버리지 | A- | 84 |
| 아키텍처/의존성 | B+ | 80 |

---

## CRITICAL (즉시 수정 필요)

### C-1. generateAgentCode() Race Condition — 중복 대리점 코드 생성
- **위치**: `agents.service.ts` line 120-132
- **증상**: `count()` 쿼리로 시퀀스 번호 생성 후 `create()`까지 트랜잭션 없이 수행됨. 동시 대리점 등록 시 동일 코드 생성 가능
- **영향**: 대리점 식별 불가, 수수료·정산·조회 혼란
- **수정안**: `$transaction({ isolationLevel: 'Serializable' })` 내부에서 count+create 원자적 처리 + DB UNIQUE 제약 `(agent_code)` 추가

### C-2. 감사 로그 미연동 — 대리점 CRUD 변경 추적 누락
- **위치**: `agents.service.ts` — `create()`, `update()`, `changeStatus()`, `remove()` 전체
- **증상**: 대리점 생성·수정·상태변경·삭제 시 `audit_logs` 테이블에 기록하지 않음
- **영향**: PCI DSS 10.2.2 "금융 관련 데이터 변경 이력 기록" 미충족. 대리점 계층 변경 분쟁 시 증거 부재
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 생성/수정/상태변경/삭제 시점에 변경 전후값 감사 기록

### C-3. remove() 4단계 check-then-act — 원자성 부재
- **위치**: `agents.service.ts` — `remove()` 메서드
- **증상**: `findOne()` → `count(subAgents)` → `count(merchants)` → `update(deleted_at)` 4단계가 트랜잭션 없이 수행됨. 3번째 단계 사이에 새 가맹점 등록 가능
- **영향**: 가맹점이 연결된 대리점 삭제 → 고아 가맹점 발생. 정산·수수료 연쇄 오류
- **수정안**: 전체 4단계를 `$transaction({ isolationLevel: 'Serializable' })` 내부로 이동

---

## HIGH (Sprint 내 수정 권장)

### H-1. OwnershipInterceptor 미적용 — 데이터 격리 부재
- **위치**: `agents.controller.ts`
- **증상**: MerchantsController는 `@UseInterceptors(OwnershipInterceptor)` 적용하나, AgentsController는 미적용
- **영향**: 대리점 A가 대리점 B의 상세 정보 조회 가능. 소속 가맹점·수수료 정보 노출
- **수정안**: AgentsController에 OwnershipInterceptor 적용 + 대리점별 데이터 격리 검증

### H-2. 상태 전이 검증 부재 — 임의 상태 변경 가능
- **위치**: `agents.service.ts` — `changeStatus()` 메서드
- **증상**: 현재 상태와 무관하게 어떤 상태로든 변경 가능. TERMINATED→ACTIVE 등 비정상 전이 허용
- **영향**: 해지된 대리점 재활성화, 수수료 계층 역전
- **수정안**: `validTransitions` 맵 기반 상태 머신 구현

### H-3. 부모 대리점 상태 변경 시 하위 계층 미연동
- **위치**: `agents.service.ts` — `changeStatus()` 메서드
- **증상**: 부모 대리점 SUSPENDED 변경 시 하위 대리점·가맹점은 그대로 ACTIVE 유지
- **영향**: 정지된 대리점 소속 가맹점이 계속 결제 수행. 수수료 정산 불일치
- **수정안**: 부모 SUSPENDED/TERMINATED 시 하위 대리점·가맹점 연쇄 상태 변경 또는 경고 목록 반환

### H-4. tree_depth 최대 깊이 미제한
- **위치**: `agents.service.ts` — `create()` 메서드
- **증상**: 트리 깊이 제한 없음. 이론상 무한 중첩 가능
- **영향**: 수수료 계층 복잡성 폭증, 트리 쿼리 성능 저하, 비즈니스 로직 복잡화
- **수정안**: `MAX_TREE_DEPTH = 5` 상수 + 생성 시 `if (parentDepth + 1 > MAX_TREE_DEPTH) throw` 검증

### H-5. businessNo 형식 검증 부재
- **위치**: `dto/create-agent.dto.ts`
- **증상**: MerchantsDTO와 동일 — `@IsString()` + `@MaxLength(20)` 만 적용
- **영향**: 비정상 사업자등록번호 저장
- **수정안**: `@Matches(/^\d{3}-\d{2}-\d{5}$/)` 정규식 추가

### H-6. Swagger 응답 타입 미상세
- **위치**: `agents.controller.ts` 전체 7개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: AgentResponseDto })` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. 대리점 재배치(re-parenting) 미지원
- **위치**: `agents.service.ts` — `update()` 메서드
- **증상**: 대리점의 parentAgentId 변경 불가. 조직 구조 변경 시 삭제→재생성 필요
- **영향**: 운영 유연성 부족. 대리점 합병·분할 대응 불가
- **수정안**: `reparent()` 메서드 추가 — 하위 트리 전체의 tree_path/tree_depth 재계산

### M-2. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 대리점 생성(코드 충돌), 동시 삭제 시나리오 0건
- **영향**: Race condition(C-1, C-3) 재현 테스트 없음
- **수정안**: `Promise.all` 기반 동시 생성/삭제 테스트 추가

### M-3. 상태 전이 검증 테스트 부재
- **위치**: `__tests__/agents.service.spec.ts`
- **증상**: 유효하지 않은 전이(TERMINATED→ACTIVE) 검증 없음
- **영향**: H-2 수정 후 회귀 검증 불가
- **수정안**: 허용/비허용 상태 전이 매트릭스 테스트 추가

### M-4. 트리 경로 정합성 검증 테스트 부재
- **위치**: 테스트 전반
- **증상**: 삭제된 부모의 tree_path가 하위에 잔존하는 케이스 미검증
- **영향**: 트리 구조 깨짐 시 감지 불가
- **수정안**: 부모 삭제 후 하위 트리 정합성 검증 테스트

### M-5. search 필드 MaxLength 미제한
- **위치**: `dto/agent-list-query.dto.ts`
- **증상**: Merchants DTO와 동일한 이슈
- **영향**: DB LIKE 쿼리 성능 저하 가능
- **수정안**: `@MaxLength(100)` 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **트리 구조 관리** | tree_path + tree_depth로 계층 표현. 부모 경로 기반 하위 조회 효율적 |
| **삭제 가드** | 하위 대리점·가맹점 존재 시 삭제 거부 — 고아 레코드 방지 |
| **부모 상태 검증** | 비활성(SUSPENDED/TERMINATED) 부모에 자식 생성 거부 |
| **Soft Delete** | deleted_at 필드 기반 논리 삭제 |
| **은행 계좌 마스킹** | 조회 시 maskBankAccount()로 마스킹 |
| **ParseUUIDPipe** | 모든 ID 파라미터에 UUID 형식 검증 |
| **E2E 전체 플로우** | 20개 시나리오 — 생성(최상위/하위/중복/검증)→조회→수정→하위조회→상태변경→삭제가드→삭제→소프트삭제확인 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1.5h | DB 스키마 (UNIQUE 제약) |
| 2 | C-3 | 2h | 없음 (트랜잭션 래핑) |
| 3 | C-2 | 2h | SecurityModule 연동 |
| 4 | H-1 | 1.5h | OwnershipInterceptor 확장 |
| 5 | H-2 + H-3 | 3h | 함께 수정 (상태 머신 + 연쇄 전파) |
| 6 | H-4 + H-5 | 1h | 없음 |
| 7 | H-6 | 1h | 없음 |
| 8 | M-2~M-4 | 2h | 테스트 |
| 9 | M-1 | 4h | 복잡 (트리 재계산) |

> C-1(코드 충돌)은 운영 안정성 필수. H-1(OwnershipInterceptor)은 데이터 격리 필수
