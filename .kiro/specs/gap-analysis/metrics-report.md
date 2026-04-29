# Metrics 모듈 Gap Report (13/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B (74/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 78 |
| 컨트롤러/DTO | B- | 72 |
| 테스트 커버리지 | D | 50 |
| 아키텍처/의존성 | B+ | 82 |

---

## CRITICAL (즉시 수정 필요)

### C-1. /metrics 엔드포인트 @Public() — 내부 시스템 정보 무인증 노출
- **위치**: `metrics.controller.ts` — `@Public()` 데코레이터
- **증상**: Prometheus 메트릭 엔드포인트가 인증 없이 공개. 주석에 "nginx/방화벽으로 내부망만 접근 허용"이라 적혀 있으나, 애플리케이션 레벨 보호 없음
- **영향**: 공격자가 응답 시간 분포, 에러율, 활성 사용자 수, DB 쿼리 성능, FDS 경고 수 등 내부 운영 데이터 수집 가능. 시스템 약점 파악(느린 엔드포인트, 장애 패턴) 후 타겟 공격에 활용
- **수정안**: (1) IP 화이트리스트 가드 적용 (내부 Prometheus 서버 IP만 허용) 또는 (2) Bearer 토큰 기반 인증 + 환경변수 `METRICS_AUTH_TOKEN` 또는 (3) 별도 포트(9090) 바인딩으로 메인 API와 분리

---

## HIGH (Sprint 내 수정 권장)

### H-1. 테스트 0건 — 전체 모듈 미검증
- **위치**: `__tests__/` 디렉토리 부재
- **증상**: MetricsService, MetricsController 모두 단위/통합/E2E 테스트 없음
- **영향**: 메트릭 등록, 기본 메트릭 수집, 레지스트리 출력 등 핵심 동작 미검증. Prometheus 연동 오류 시 모니터링 사각지대
- **수정안**: `metrics.service.spec.ts` (레지스트리 메트릭 이름 확인, getMetrics() 출력 형식, Counter/Histogram 증분 검증)

### H-2. activeUsersGauge 미연동 — 선언만 존재
- **위치**: `metrics.service.ts` line 31-35
- **증상**: `active_users_gauge` Gauge가 선언되었으나, 증가/감소를 호출하는 코드가 모듈 내외부 어디에도 없음
- **영향**: Prometheus 대시보드에서 항상 0. 운영팀이 활성 사용자 메트릭을 신뢰하게 되면 잘못된 판단 유도
- **수정안**: AuthModule 로그인/로그아웃 시 `gauge.inc()`/`gauge.dec()` 연동 또는 미사용 시 제거

### H-3. 고카디널리티 라벨 위험 — route 라벨
- **위치**: `metrics.service.ts` — `httpRequestsTotal`, `httpRequestDurationSeconds`
- **증상**: `route` 라벨이 실제 요청 경로를 그대로 사용하면 UUID 포함 경로(`/users/abc-123-def`)마다 별도 시계열 생성
- **영향**: Prometheus 메모리 폭증 (카디널리티 폭발). 수만 개 시계열 → 스크레이핑 지연
- **수정안**: MetricsInterceptor에서 경로 정규화 — `/users/:id` 패턴으로 변환 후 라벨 설정. 실제 InterceptorUUID 치환 로직 확인 필요

### H-4. Swagger 응답 스키마 부정확
- **위치**: `metrics.controller.ts` — `@ApiResponse`
- **증상**: `schema: { example: "..." }` 로만 정의. Prometheus 텍스트 형식은 일반 JSON이 아니므로 Swagger에서 정확한 스키마 표현이 어려우나, content-type도 명시 필요
- **영향**: API 소비자 혼란 — JSON으로 오해
- **수정안**: `@ApiProduces('text/plain')` 추가 또는 설명에 "Prometheus exposition format" 명시

---

## MEDIUM (다음 Sprint 수정)

### M-1. getContentType() 불필요한 Promise.resolve 래핑
- **위치**: `metrics.controller.ts` line 26-29
- **증상**: `getContentType()`은 동기 메서드인데 `Promise.resolve()`로 래핑 후 `Promise.all`에 포함
- **영향**: 가독성 저하, 불필요한 마이크로태스크 생성
- **수정안**: `const metrics = await this.metricsService.getMetrics(); res.setHeader('Content-Type', this.metricsService.getContentType());`

### M-2. 비즈니스 메트릭 부재
- **위치**: `metrics.service.ts`
- **증상**: 결제 성공률, 평균 결제 금액, 정산 처리 건수 등 PG 핵심 비즈니스 메트릭 없음. 인프라 메트릭(HTTP, DB)만 존재
- **영향**: 운영 모니터링에서 비즈니스 이상 감지 불가. "결제 성공률 급감" 등 알림 설정 불가
- **수정안**: `payment_success_total`, `payment_failure_total`, `settlement_processed_total` 등 비즈니스 Counter 추가

### M-3. 메트릭 이름 네이밍 컨벤션 혼재
- **위치**: `metrics.service.ts`
- **증상**: `active_users_gauge` (접미사에 타입명 포함) vs `http_requests_total` (Prometheus 컨벤션 준수). Prometheus 권장은 `_total` Counter, `_seconds` Histogram이며 Gauge에 `_gauge` 접미사는 비권장
- **영향**: Prometheus 커뮤니티 컨벤션 미준수 → Grafana 대시보드 자동 감지 어려움
- **수정안**: `active_users_gauge` → `active_users` (Gauge는 접미사 없음이 표준)

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **커스텀 레지스트리** | `new promClient.Registry()` — 기본 레지스트리 오염 방지, 테스트 용이 |
| **적절한 히스토그램 버킷** | HTTP: 5ms~5s, DB: 1ms~1s — PG 시스템에 적합한 분포 |
| **FDS 메트릭** | `risk_alerts_total` — 보안 모니터링 대시보드 연동 가능 |
| **기본 메트릭 수집** | `collectDefaultMetrics()` — Node.js 런타임 메트릭 자동 수집 |
| **올바른 Content-Type** | Prometheus exposition format 헤더 정확하게 설정 |
| **모듈 export** | MetricsService를 export하여 다른 모듈에서 메트릭 기록 가능 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 1h | IP 가드 또는 토큰 인증 |
| 2 | H-1 | 1.5h | 없음 (테스트 작성) |
| 3 | H-2 | 0.5h | AuthModule 연동 또는 제거 |
| 4 | H-3 | 1h | MetricsInterceptor 확인 |
| 5 | H-4 | 0.5h | 없음 |
| 6 | M-1~M-3 | 1.5h | 없음 |

> C-1(@Public 메트릭)은 내부 정보 노출 방지 필수. H-1(테스트 0건)은 유일한 무테스트 모듈
