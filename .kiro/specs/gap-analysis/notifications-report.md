# Notifications 모듈 Gap Report (12/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: B+ (80/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | B+ | 80 |
| 컨트롤러/DTO | N/A | — |
| 테스트 커버리지 | B | 75 |
| 아키텍처/의존성 | A- | 86 |

> 참고: 내부 서비스 모듈 (컨트롤러/DTO 없음 — 다른 모듈에서 DI로 사용)

---

## CRITICAL (즉시 수정 필요)

### C-1. CRITICAL 알림 유실 시 폴백 없음 — 보안 이벤트 사각지대
- **위치**: `notifications.service.ts` — `send()` 메서드
- **증상**: Slack과 Email 모두 실패 시 `logger.error()` 만 기록하고 조용히 종료. CRITICAL 심각도 알림(FDS 탐지, 시스템 장애)도 동일하게 처리
- **영향**: FDS 이상 거래 탐지, 시스템 다운 등 CRITICAL 알림이 모든 채널에서 실패 시 아무도 인지하지 못함. PCI DSS 10.6.1 "보안 이벤트 즉시 통보" 미충족
- **수정안**: CRITICAL 심각도 실패 시 재시도 큐(Bull/BullMQ) 또는 DB 저장 + 별도 재전송 배치. 최소한 `failed_notifications` 테이블에 미전송 기록

### C-2. 알림 전송 이력 미기록 — 감사 추적 불가
- **위치**: `notifications.service.ts` 전체
- **증상**: 알림 전송 성공/실패 이력을 DB에 기록하지 않음. 인메모리 dedup Map만 존재
- **영향**: "언제 누구에게 어떤 알림을 보냈는지" 추적 불가. 장애 대응 시 알림 발송 여부 확인 불가. 감사 시 알림 체계 증명 어려움
- **수정안**: `notification_logs` 테이블 (channel, severity, title, status, sent_at, error_message) + 전송 시마다 기록

---

## HIGH (Sprint 내 수정 권장)

### H-1. Email 채널 재시도 미구현 — Slack과 비대칭
- **위치**: `channels/email.channel.ts` — `send()` 메서드
- **증상**: Slack은 MAX_RETRIES=3 재시도 구현하나, Email은 1회 시도 후 실패 시 바로 포기
- **영향**: 일시적 SMTP 장애 시 Email 알림 유실. Slack만 살아있으면 Email 수신자는 미인지
- **수정안**: Slack과 동일한 재시도 패턴 적용 또는 공통 재시도 유틸 추출

### H-2. 인메모리 dedup Map 메모리 누수 위험
- **위치**: `notifications.service.ts` — `recentEvents` Map
- **증상**: Map 최대 크기 제한 없음. `cleanupExpiredEntries()`가 매 send 시 전체 순회하나, 고빈도 이벤트 시 Map 크기 무제한 증가
- **영향**: 장기 운영 시 메모리 누수. 특히 다양한 title 패턴의 이벤트 폭주 시
- **수정안**: `MAX_DEDUP_ENTRIES = 10000` 상한 + LRU 방식 또는 정기 정리 간격 분리

### H-3. 심각도 기반 채널 라우팅 없음
- **위치**: `notifications.service.ts` — `send()` 메서드
- **증상**: 모든 심각도(CRITICAL~INFO)가 동일하게 Slack+Email 양쪽 발송. INFO 레벨도 이메일 발송
- **영향**: 이메일 스팸화 → 수신자가 알림 무시 습관 형성. CRITICAL 알림이 INFO 속에 묻힘
- **수정안**: 라우팅 맵 — `CRITICAL/HIGH → Slack+Email`, `MEDIUM → Slack`, `LOW/INFO → Slack(선택)`

### H-4. Email SMTP secure: false 하드코딩
- **위치**: `channels/email.channel.ts` line 26
- **증상**: `secure: false` 하드코딩. TLS/SSL 설정이 환경변수로 구성 불가
- **영향**: 프로덕션에서 비암호화 SMTP 연결 사용 위험. SMTP 통신 도청 가능
- **수정안**: `this.config.get<boolean>('notification.smtp.secure', true)` 로 변경 + 기본값 true

### H-5. Slack 재시도 간격 고정 — 백오프 없음
- **위치**: `channels/slack.channel.ts` — retry 루프
- **증상**: 재시도 간격이 `RETRY_INTERVAL_MS = 1000` 고정. 지수 백오프(exponential backoff) 없음
- **영향**: Slack API rate limit 시 동일 간격 재시도 → 제한 해제 전 모든 재시도 소진
- **수정안**: `RETRY_INTERVAL_MS * 2^(attempt-1)` 지수 백오프 또는 최소 `attempt * RETRY_INTERVAL_MS` 선형 증가

---

## MEDIUM (다음 Sprint 수정)

### M-1. 채널 단위 테스트 부재
- **위치**: `__tests__/` 디렉토리
- **증상**: `SlackChannel`, `EmailChannel` 각각의 단위 테스트 없음. 서비스 테스트만 9건 존재
- **영향**: 재시도 로직, webhookUrl 미설정 스킵, SMTP 연결 실패 등 개별 채널 동작 미검증
- **수정안**: `slack.channel.spec.ts`, `email.channel.spec.ts` 추가

### M-2. dedup 만료 후 재발송 테스트 부재
- **위치**: `__tests__/notifications.service.spec.ts`
- **증상**: 5분 이내 중복 차단은 검증하나, 5분 경과 후 재발송 허용 테스트 없음
- **영향**: dedup 만료 로직 회귀 미검증
- **수정안**: `jest.advanceTimersByTime(5 * 60 * 1000)` 활용 시간 경과 테스트

### M-3. Email HTML 메타데이터 이스케이프 부재
- **위치**: `channels/email.channel.ts` line 40-41
- **증상**: `JSON.stringify(payload.metadata)` 결과를 `<pre>` 태그 내에 직접 삽입. 메타데이터에 HTML 태그 포함 시 이스케이프 없음
- **영향**: 메타데이터에 `<script>` 등 포함 시 이메일 클라이언트에서 실행 가능 (대부분 차단하나 일부 클라이언트 취약)
- **수정안**: `JSON.stringify()` 결과에 HTML 엔티티 이스케이프 적용

### M-4. 앱 재시작 시 dedup 상태 유실
- **위치**: `notifications.service.ts` — `recentEvents` Map
- **증상**: 인메모리 Map → 앱 재시작 시 전체 초기화. 재시작 직후 5분 이내 중복 이벤트 다시 발송
- **영향**: 배포 시마다 중복 알림 가능
- **수정안**: Redis 기반 dedup으로 전환 (운영 환경)

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **Strategy 패턴** | `NotificationChannel` 인터페이스 → Slack/Email 구현체 분리. 새 채널(카카오, SMS) 추가 용이 |
| **에러 격리** | 채널별 `.catch()` — 한 채널 실패가 다른 채널에 영향 안 줌 |
| **중복 방지** | title+severity 조합 기반 5분 dedup — 알림 폭풍 방지 |
| **Graceful Skip** | 설정 미완료 채널은 경고 없이 스킵 — 개발 환경 편의 |
| **@Global 모듈** | 전체 앱에서 DI 가능 — 어디서든 `NotificationsService` 주입 |
| **타입 안전** | `NotificationSeverity` 유니온 타입, `Record<string, unknown>` 메타데이터 |
| **Slack 재시도** | 3회 재시도 + 로깅 — 일시적 장애 대응 |
| **테스트 에러 격리** | Slack 실패/Email 실패/양쪽 실패 3가지 시나리오 모두 검증 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 2h | DB 스키마 또는 큐 시스템 |
| 2 | C-2 | 1.5h | DB 스키마 (notification_logs) |
| 3 | H-1 | 0.5h | 없음 (코드 추가) |
| 4 | H-2 | 0.5h | 없음 (상한 추가) |
| 5 | H-3 | 1h | 없음 (라우팅 맵) |
| 6 | H-4 + H-5 | 0.5h | 없음 |
| 7 | M-1 + M-2 | 2h | 테스트 |
| 8 | M-3 + M-4 | 1.5h | Redis (M-4만) |

> C-1(CRITICAL 알림 유실)은 보안 모니터링 신뢰성 필수. C-2(전송 이력)는 감사 추적 필수
