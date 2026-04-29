# System 모듈 Gap Report (15/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (79/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 80 |
| 컨트롤러/DTO | B+ | 82 |
| 테스트 커버리지 | B- | 70 |
| 아키텍처/의존성 | B+ | 84 |

---

## CRITICAL (즉시 수정 필요)

### C-1. createCode() check-then-act — 중복 코드 생성 Race Condition
- **위치**: `system.service.ts` — `createCode()` 메서드
- **증상**: `findUnique({ group_code, code })` 조회 후 별도 `create()` 호출. 트랜잭션 없이 수행되어 동시 요청 시 중복 시스템 코드 생성 가능
- **영향**: 동일 group_code+code 조합이 2개 존재 → 결제수단/은행코드 등 시스템 공통 코드 혼란. 캐시 무효화도 비일관적
- **수정안**: `$transaction({ isolationLevel: 'Serializable' })` 내부에서 중복 체크+생성 원자적 처리 + DB UNIQUE 제약 확인 (복합 유니크 `group_code_code` 인덱스 존재 여부)

### C-2. 감사 로그 미연동 — 시스템 코드 CRUD 변경 추적 누락
- **위치**: `system.service.ts` — `createCode()`, `updateCode()`, `deleteCode()` 전체
- **증상**: `_performedBy` 파라미터를 받으나 `writeAuditLog()` 호출 없음. 시스템 코드 생성/수정/삭제 이력 미기록
- **영향**: 시스템 설정 변경 추적 불가. 결제수단 코드 변경, 은행 코드 추가 등 핵심 설정 변경 감사 불가
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — CUD 시점에 변경 전후값 감사 기록

---

## HIGH (Sprint 내 수정 권장)

### H-1. updateCode/deleteCode check-then-act — 원자성 부재
- **위치**: `system.service.ts` — `updateCode()` line 80, `deleteCode()` line 111
- **증상**: `findUnique()` 조회 후 별도 `update()` 호출. 동시 요청 시 삭제된 코드 재수정, 이중 삭제 가능
- **영향**: 이미 비활성화된 코드 수정 → 캐시 무효화 불필요 발생
- **수정안**: `update({ where: { id, is_active: true } })` 조건부 업데이트 또는 트랜잭션 래핑

### H-2. getHolidays/getMenuTree/getActiveNotifications 테스트 0건
- **위치**: `__tests__/system.service.spec.ts`
- **증상**: system_codes CRUD 9건 테스트 존재하나, 공휴일·메뉴 트리·알림 3개 메서드는 테스트 없음
- **영향**: 메뉴 트리 빌드 로직(Map 기반 부모-자식 연결) 미검증. 캐시 히트/미스 미검증
- **수정안**: 3개 메서드 단위 테스트 추가 (특히 메뉴 트리 부모-자식 구성 검증)

### H-3. 캐시 히트 시나리오 테스트 부재
- **위치**: `__tests__/system.service.spec.ts`
- **증상**: 모든 테스트에서 `mockCache.get.mockResolvedValue(undefined)` → 항상 캐시 미스 경로만 테스트
- **영향**: 캐시에서 데이터 반환 시 Prisma 쿼리 미호출 검증 없음. 캐시 로직 회귀 미검증
- **수정안**: 캐시 히트 테스트 — `mockCache.get.mockResolvedValueOnce(cachedData)` → `prisma.findMany` 미호출 확인

### H-4. Swagger 응답 타입 미상세
- **위치**: `system.controller.ts` 전체 8개 엔드포인트
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 시스템 코드/공휴일/메뉴 응답 구조 파악 어려움
- **수정안**: `SystemCodeResponseDto`, `HolidayResponseDto`, `MenuTreeResponseDto` 등 정의 + 적용

### H-5. groupCode 파라미터 검증 부재
- **위치**: `system.controller.ts` line 61 — `getCodesByGroup(@Param("groupCode") groupCode: string)`
- **증상**: `groupCode` 파라미터에 길이 제한, 형식 제한 없음. 캐시 키(`system_codes:group:${groupCode}`)에 직접 사용
- **영향**: 매우 긴 문자열 → 캐시 키 오염, 특수문자 포함 시 캐시 키 충돌 가능
- **수정안**: `@MaxLength(30)` + `@Matches(/^[A-Z_]+$/)` 형식 검증 (커스텀 파이프 또는 DTO)

---

## MEDIUM (다음 Sprint 수정)

### M-1. getActiveNotifications is_read 하드코딩
- **위치**: `system.service.ts` line 194 — `where: { is_read: false }`
- **증상**: 읽음 상태가 서비스에 하드코딩. 읽은 알림 조회, 필터링 불가
- **영향**: 운영 유연성 부족. 알림 이력 조회 기능 확장 어려움
- **수정안**: 파라미터로 `isRead` 옵션 전달 또는 별도 엔드포인트

### M-2. 캐시 무효화 패턴 반복 — DRY 위반
- **위치**: `system.service.ts` — `createCode()`, `updateCode()`, `deleteCode()`
- **증상**: `cache.del("system_codes:all") + cache.del(group key)` 패턴이 3회 반복
- **영향**: 캐시 키 변경 시 3곳 수정 필요. 누락 위험
- **수정안**: `private invalidateCodeCache(groupCode: string)` 헬퍼 메서드 추출

### M-3. E2E 테스트 부재
- **위치**: 테스트 디렉토리
- **증상**: 단위 테스트 9건 있으나 E2E 테스트 없음
- **영향**: JWT 인증 + SYSTEM_MANAGE 권한 + CRUD 통합 검증 불가
- **수정안**: E2E 테스트 추가 — 권한 없는 사용자 접근 거부 + CRUD 플로우

### M-4. 공휴일 연도 하드코딩
- **위치**: `system.service.ts` — `getHolidays()` line 132
- **증상**: `new Date().getFullYear()` — 현재 연도만 조회. 다음 해 공휴일 조회 불가
- **영향**: 연말 정산 미리 확인 불가. 캐시 키도 연도별이라 연초 캐시 갱신 타이밍 이슈
- **수정안**: `year` 파라미터 추가 (기본값 현재 연도)

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **캐시 전략** | CACHE_MANAGER 활용, TTL은 shared 패키지 상수. CUD 시 관련 캐시 즉시 무효화 |
| **shared 패키지 활용** | ERROR_CODES, CACHE_TTL, PERMISSIONS — 공유 상수 import (OST 원칙) |
| **메뉴 트리 빌드** | Map 기반 O(n) 알고리즘 — 부모-자식 관계를 효율적으로 구성 |
| **Soft Delete** | `is_active: false` 로 논리 삭제 — 코드 이력 보존 |
| **복합 유니크** | `group_code_code` 복합 키로 중복 체크 — DB 레벨 무결성 |
| **SYSTEM_MANAGE 권한** | 모든 엔드포인트에 동일 권한 적용 — SUPER_ADMIN 전용 |
| **ParseUUIDPipe** | CUD 엔드포인트에 UUID 형식 검증 |
| **에러 코드 체계** | SYS_001(미발견)/SYS_002(중복) 구조화 에러 코드 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1h | 트랜잭션 래핑 |
| 2 | C-2 | 1.5h | SecurityModule 연동 |
| 3 | H-1 | 0.5h | 없음 (조건부 업데이트) |
| 4 | H-2 + H-3 | 2h | 테스트 |
| 5 | H-4 | 1h | DTO 생성 |
| 6 | H-5 | 0.5h | 없음 (밸리데이션 파이프) |
| 7 | M-1~M-4 | 2h | 테스트 + 파라미터 추가 |

> C-1(중복 코드)은 시스템 설정 정합성 필수. C-2(감사 로그)는 설정 변경 추적 필수
