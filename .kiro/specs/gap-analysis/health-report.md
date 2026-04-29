# Health 모듈 Gap Report (14/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (80/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 82 |
| 컨트롤러/DTO | A- | 85 |
| 테스트 커버리지 | D | 50 |
| 아키텍처/의존성 | A- | 88 |

---

## CRITICAL (즉시 수정 필요)

없음.

---

## HIGH (Sprint 내 수정 권장)

### H-1. 테스트 0건 — 헬스체크 동작 미검증
- **위치**: `__tests__/` 디렉토리 부재
- **증상**: HealthService, HealthController 모두 단위/통합/E2E 테스트 없음
- **영향**: DB 연결 실패 시 unhealthy 반환, ServiceUnavailableException 발생, 알림 발송 등 핵심 동작 미검증. k8s 프로브 오작동 시 서비스 재시작 루프 가능
- **수정안**: `health.service.spec.ts` (DB 정상/실패, 알림 발송, latency 측정) + `health.controller.spec.ts` (200/503 응답, liveness 응답)

### H-2. readiness()와 check() 동일 구현 — 의미 분화 미완
- **위치**: `health.controller.ts` — `check()` line 36, `readiness()` line 55
- **증상**: 두 메서드가 동일한 `getHealthStatus()` 호출. Readiness Probe는 "트래픽 수신 준비" 판정이므로 DB 외에 Redis, 외부 서비스(VAN/카드사) 연결 상태도 확인해야 함
- **영향**: DB만 확인하면 Redis 장애 시에도 "ready" 판정 → 트래픽 유입 → 에러 폭주
- **수정안**: `checkReadiness()` 별도 메서드 — DB + Redis + 외부 의존성 종합 판정

### H-3. APP_VERSION 하드코딩
- **위치**: `health.service.ts` line 7 — `const APP_VERSION = "1.0.0"`
- **증상**: 버전이 소스 코드에 하드코딩. 배포 시마다 수동 변경 필요
- **영향**: 실제 배포 버전과 불일치 → 디버깅/인시던트 대응 시 버전 확인 불가
- **수정안**: `require('../../package.json').version` 또는 환경변수 `BUILD_VERSION`에서 로드

### H-4. DB 외 의존성 헬스체크 부재
- **위치**: `health.service.ts` — `getHealthStatus()` 메서드
- **증상**: DB(PostgreSQL) 연결만 확인. Redis, Slack Webhook, SMTP, 외부 VAN 연결 미확인
- **영향**: DB 정상이지만 Redis/SMTP 장애 시 "healthy" 판정 → 결제 처리·알림 발송 실패 감지 지연
- **수정안**: `checkRedis()`, `checkExternalServices()` 추가 + 종합 상태 산출

---

## MEDIUM (다음 Sprint 수정)

### M-1. liveness 응답 타입 미정의
- **위치**: `health.controller.ts` line 71 — `liveness(): { status: string }`
- **증상**: 인라인 타입 리터럴 반환. Swagger 스키마에 `schema: { example }` 만 있고 DTO 미정의
- **영향**: API 문서 일관성 부족. check/readiness는 HealthResponse DTO 사용하나 liveness만 예외
- **수정안**: `LivenessResponseDto` 생성 또는 HealthResponse 재사용

### M-2. 헬스체크 빈도 제한 없음
- **위치**: `health.controller.ts`
- **증상**: @Public() 엔드포인트에 Rate Limiting 없음. 고빈도 호출 시 `SELECT 1` 쿼리 반복
- **영향**: 악의적 고빈도 호출로 DB 연결 풀 소진 가능
- **수정안**: Rate Limiting (분당 60회) 또는 결과 캐싱 (TTL 5초)

### M-3. DB latency 임계값 경고 부재
- **위치**: `health.service.ts` — `checkDatabase()` 메서드
- **증상**: DB latency를 측정하지만, 임계값(예: 1000ms) 초과 시 경고 없음. connected/disconnected 이분법만 존재
- **영향**: DB 응답 느려져 1~2초 걸려도 "healthy" → 실제 사용자는 타임아웃 경험
- **수정안**: `if (latency > DB_LATENCY_THRESHOLD_MS) severity = "degraded"` 중간 상태 추가 + 알림

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **3-Probe 패턴** | `/health` (전체) + `/health/ready` (Readiness) + `/health/live` (Liveness) — k8s 베스트 프랙티스 |
| **Liveness 경량 설계** | DB 쿼리 없이 즉시 `{ status: "alive" }` 반환 — 프로세스 생존만 확인 |
| **ServiceUnavailableException** | unhealthy 시 HTTP 503 반환 — 로드밸런서가 자동 제외 |
| **Swagger 응답 DTO** | `HealthResponse`, `DatabaseHealth` 완전한 @ApiProperty 정의 — 프로젝트 내 최고 수준 |
| **Fire-and-forget 알림** | DB 장애 시 NotificationsService로 비동기 알림 + void 무시로 헬스체크 지연 방지 |
| **@Optional() DI** | NotificationsService 미등록 시에도 서비스 정상 동작 — 의존성 유연성 |
| **Prisma.sql 안전 쿼리** | SQL 인젝션 방지된 raw query |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | H-1 | 1.5h | 없음 (테스트 작성) |
| 2 | H-2 | 1h | Redis 연동 |
| 3 | H-3 | 0.5h | 없음 (패키지 버전 읽기) |
| 4 | H-4 | 2h | Redis, 외부 서비스 클라이언트 |
| 5 | M-1~M-3 | 1.5h | 없음 |

> H-1(테스트 부재)은 k8s 프로브 신뢰성 필수. H-4(DB 외 의존성)는 운영 모니터링 완성도
