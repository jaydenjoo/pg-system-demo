# Users 모듈 Gap Report (10/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (79/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 78 |
| 컨트롤러/DTO | A- | 83 |
| 테스트 커버리지 | B+ | 78 |
| 아키텍처/의존성 | B | 77 |

---

## CRITICAL (즉시 수정 필요)

### C-1. create() login_id 유일성 check-then-act — 중복 사용자 생성
- **위치**: `users.service.ts` — `create()` 메서드
- **증상**: `findUnique({ login_id })` 조회 후 별도 `create()` 호출. 트랜잭션 없이 수행되어 동시 요청 시 중복 login_id 생성 가능
- **영향**: 동일 계정 2개 생성 → 인증 혼란, 권한 중복 할당
- **수정안**: `$transaction({ isolationLevel: 'Serializable' })` 내부에서 중복 체크+생성 원자적 처리 + DB UNIQUE 제약 확인

### C-2. 감사 로그 미연동 — 사용자/역할 CRUD 변경 추적 누락
- **위치**: `users.service.ts`, `roles.service.ts` 전체 CUD 메서드
- **증상**: `_performedBy` 파라미터를 받으나 `writeAuditLog()` 호출 없음. `created_by`/`updated_by` 필드만 기록
- **영향**: PCI DSS 10.2.2 위반 — "누가 왜" 변경했는지 감사 추적 불가. 사용자 권한 변경, 역할 생성/삭제 이력 없음
- **수정안**: SecurityModule의 `writeAuditLog()` 연동 — 사용자 생성/수정/삭제/역할할당 + 역할 생성/수정/삭제/권한할당 시점에 감사 기록

### C-3. updateProfile() 현재 비밀번호 미검증 — 비밀번호 무단 변경
- **위치**: `users.service.ts` — `updateProfile()` 메서드
- **증상**: 새 비밀번호(`newPassword`)만 받고 현재 비밀번호 확인 없이 변경 가능
- **영향**: 세션 탈취 시 비밀번호 즉시 변경 → 계정 완전 탈취. PCI DSS 8.3.7 "이전 비밀번호 확인 후 변경" 미충족
- **수정안**: `UpdateMyProfileDto`에 `currentPassword` 필수 필드 추가 + bcrypt.compare 검증

---

## HIGH (Sprint 내 수정 권장)

### H-1. remove() check-then-act + 자기 삭제 방지 없음
- **위치**: `users.service.ts` — `remove()` 메서드
- **증상**: `findById()` → `update(deleted_at)` 트랜잭션 없이 수행. 현재 로그인한 자신의 계정 삭제 방지 로직 없음
- **영향**: 관리자가 자기 계정 삭제 → 시스템 잠금. 동시 요청 시 이미 삭제된 사용자 재삭제
- **수정안**: `if (userId === performedBy) throw ForbiddenException` + 조건부 업데이트 `where: { id, deleted_at: null }`

### H-2. assignRoles 빈 배열 허용 — 전체 역할 삭제
- **위치**: `dto/assign-roles.dto.ts`, `users.service.ts` — `assignRoles()` 메서드
- **증상**: `roleIds: []` 전달 시 기존 역할 전체 삭제 + 새 역할 0개 할당 → 사용자 무권한 상태
- **영향**: 관리자 포함 모든 사용자 무권한 가능. 실수로 빈 배열 전송 시 권한 완전 소실
- **수정안**: `@ArrayMinSize(1)` 추가 또는 서비스에서 빈 배열 거부

### H-3. assignPermissions 빈 배열 허용 — 전체 권한 삭제
- **위치**: `dto/assign-permissions.dto.ts`, `roles.service.ts` — `assignPermissions()` 메서드
- **증상**: H-2와 동일 패턴. `permissionIds: []` 전달 시 역할의 모든 권한 삭제
- **영향**: 핵심 역할(SUPER_ADMIN)의 권한 전체 삭제 가능
- **수정안**: `@ArrayMinSize(1)` 추가 또는 서비스에서 빈 배열 거부

### H-4. createRole() name 유일성 check-then-act
- **위치**: `roles.service.ts` — `createRole()` 메서드
- **증상**: `findUnique({ name })` 조회 후 별도 `create()`. 동시 요청 시 중복 역할명 생성 가능
- **영향**: 동일 이름 역할 2개 → 권한 할당 혼란
- **수정안**: 트랜잭션 래핑 + DB UNIQUE 제약 `(name, user_type)` 확인

### H-5. deleteRole() check-then-act — 원자성 부재
- **위치**: `roles.service.ts` — `deleteRole()` 메서드
- **증상**: `findRoleById()` → `user_roles.count()` → `$transaction(delete)` 3단계. 2단계 사이에 역할 할당 가능
- **영향**: 사용 중인 역할 삭제 → user_roles 외래키 위반 또는 고아 레코드
- **수정안**: 전체를 하나의 직렬화 트랜잭션으로 묶기

### H-6. Swagger 응답 타입 미상세
- **위치**: `users.controller.ts`, `roles.controller.ts` 전체
- **증상**: `@ApiResponse({ description })` 만 있고 `type` 미명시
- **영향**: API 소비자가 응답 구조 파악 어려움
- **수정안**: 각 엔드포인트에 `@ApiResponse({ type: UserResponseDto })` 등 추가

### H-7. search 필드 MaxLength 미제한
- **위치**: `dto/user-list-query.dto.ts` — `search` 필드
- **증상**: 길이 제한 없음. 매우 긴 검색어로 LIKE 쿼리 부하 유발 가능
- **영향**: DB 성능 저하
- **수정안**: `@MaxLength(100)` 추가

---

## MEDIUM (다음 Sprint 수정)

### M-1. 비밀번호 이력 관리 부재
- **위치**: `users.service.ts` — `create()`, `updateProfile()` 메서드
- **증상**: 이전 비밀번호 재사용 방지 로직 없음
- **영향**: PCI DSS 8.3.7 "최근 4개 비밀번호 재사용 금지" 미충족
- **수정안**: `password_history` 테이블 + 변경 시 최근 4개 해시 비교

### M-2. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 사용자 생성(login_id 충돌), 동시 역할 할당 시나리오 0건
- **영향**: Race condition(C-1, H-4) 재현 테스트 없음
- **수정안**: `Promise.all` 기반 동시 생성 테스트 추가

### M-3. soft-delete 후 재활성화 경로 없음
- **위치**: `users.service.ts`
- **증상**: `remove()` 후 `deleted_at` 복원 메서드 없음. 실수 삭제 시 복구 불가
- **영향**: 운영 유연성 부족
- **수정안**: `restore()` 메서드 추가 (deleted_at = null)

### M-4. 역할 이름 변경 시 중복 검증 부재
- **위치**: `roles.service.ts` — `updateRole()` 메서드
- **증상**: 역할 이름 변경 시 다른 역할과 이름 중복 여부 미검증
- **영향**: 동일 이름 역할 생성 가능
- **수정안**: 변경 전 `findUnique({ name, NOT: { id } })` 중복 확인

### M-5. _performedBy 미사용 파라미터 정리
- **위치**: `roles.service.ts` — 여러 메서드
- **증상**: `_performedBy` 파라미터가 언더스코어 접두사로 미사용 표시. 감사 로그 연동 시 사용 예정이나 현재는 dead parameter
- **영향**: 코드 가독성 저하, 감사 로그 미구현 증거
- **수정안**: C-2 수정 시 함께 활성화

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **bcrypt 12 라운드** | 업계 표준 이상 해싱 강도 |
| **비밀번호 필드 제외** | select에서 password_hash 항상 제외 — 응답 노출 방지 |
| **강력한 비밀번호 정책** | 12자 이상 + 영문/숫자/특수문자 복잡성 검증 (DTO 레벨) |
| **Replace-All 역할 할당** | deleteMany + createMany 트랜잭션으로 원자적 재할당 |
| **RBAC 완전 구현** | users → user_roles → roles → role_permissions → permissions 5테이블 |
| **@IsEnum(USER_TYPES)** | DTO 레벨에서 사용자 유형 런타임 검증 |
| **/me 엔드포인트** | 자기 정보 조회/수정 별도 분리 — 추가 권한 불필요 |
| **E2E 전체 플로우** | 생성→중복→검증→조회→수정→삭제→역할할당→역할조회 + 역할 CRUD + 권한 목록 |
| **에러 코드 체계** | ROLE_001/002/003 등 구조화된 에러 코드 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-3 | 1h | 없음 (DTO + bcrypt.compare) |
| 2 | C-1 | 1.5h | DB UNIQUE 제약 확인 |
| 3 | C-2 | 2h | SecurityModule 연동 |
| 4 | H-1 | 1h | 없음 |
| 5 | H-2 + H-3 | 0.5h | 없음 (DTO 데코레이터) |
| 6 | H-4 + H-5 | 2h | 트랜잭션 래핑 |
| 7 | H-6 + H-7 | 1h | 없음 |
| 8 | M-1 | 3h | DB 스키마 (password_history 테이블) |
| 9 | M-2~M-5 | 2h | 테스트 + 서비스 |

> C-3(비밀번호 무단 변경)은 계정 보안 필수. C-1(중복 계정)은 인증 정합성 필수
