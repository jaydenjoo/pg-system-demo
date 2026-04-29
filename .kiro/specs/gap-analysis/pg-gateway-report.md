# PG Gateway 모듈 Gap Report (1/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: A- (87/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A+ | 95 |
| 컨트롤러/DTO | B+ | 82 |
| 어댑터/가드 | B | 78 |
| 테스트 커버리지 | A- | 89 |

---

## CRITICAL (즉시 수정 필요)

### C-1. X-Forwarded-For 스푸핑 취약점
- **위치**: `guards/ip-whitelist.guard.ts`
- **증상**: `X-Forwarded-For` 헤더를 신뢰하여 IP 화이트리스트 우회 가능
- **영향**: 공격자가 헤더 조작으로 IP 제한 무력화
- **수정안**: 리버스 프록시(Nginx/ALB) 뒤에서만 동작하도록 `trust proxy` 설정 + 첫 번째 홉만 신뢰하는 로직 추가. 또는 `req.socket.remoteAddress` 직접 사용

### C-2. 입금 콜백 HMAC 서명 검증 없음
- **위치**: `controllers/virtual-account.controller.ts` — deposit-callback 엔드포인트
- **증상**: 외부에서 호출 가능한 콜백인데 요청 출처 검증(HMAC 서명) 없음
- **영향**: 위조 입금 알림으로 가짜 결제 승인 가능
- **수정안**: 카드사/VAN과 동일한 HMAC-SHA256 서명 검증 미들웨어 추가

### C-3. 입금 콜백 IP 필터링 없음
- **위치**: 동일 엔드포인트
- **증상**: IpWhitelistGuard가 적용되지 않음
- **영향**: 아무 IP에서 입금 콜백 호출 가능
- **수정안**: 은행/VAN 발신 IP 화이트리스트 가드 적용

---

## HIGH (Sprint 내 수정 권장)

### H-1. 응답 포맷 불일치
- **위치**: `WebhookController` vs `MerchantWebhookController`
- **증상**: 동일 기능(웹훅 관리)인데 응답 구조가 다름. WebhookController는 raw 객체, MerchantWebhookController는 `{ success, data }` envelope
- **영향**: 클라이언트 혼란, API 일관성 저하
- **수정안**: 공통 응답 envelope 패턴 통일 (`TransformInterceptor` 활용 확인)

### H-2. DTO 문자열 Sanitization 부재
- **위치**: 전체 DTO 파일들
- **증상**: `@Trim()`, `@Escape()` 데코레이터 미적용. XSS 벡터 가능
- **영향**: 웹훅 URL, 가맹점명 등에 악성 스크립트 삽입 가능
- **수정안**: class-validator `@Trim()` + class-sanitizer 또는 커스텀 파이프 추가

### H-3. 엔드포인트별 Rate Limiting 부재
- **위치**: 결제 요청 엔드포인트
- **증상**: 글로벌 ThrottlerGuard만 존재, 결제 API 전용 제한 없음
- **영향**: 카드 BIN 공격, 결제 API 남용 가능
- **수정안**: `@Throttle()` 데코레이터로 결제 엔드포인트 분당 10회 제한 (PCI DSS 권장)

---

## MEDIUM (다음 Sprint 수정)

### M-1. VolatileMap 주기적 GC 없음
- **위치**: `mock-acquirer/volatile-map.ts`
- **증상**: 만료 엔트리가 접근 시에만 삭제(lazy). 접근 없으면 메모리 누적
- **영향**: 장기 운영 시 메모리 증가 (Mock이라 실서비스 영향 낮음)
- **수정안**: `setInterval` 기반 주기적 sweep 또는 프로덕션에서 Redis 전환

### M-2. webhook.service.ts 파일 크기
- **위치**: `services/webhook.service.ts` (644줄)
- **증상**: 코딩 스타일 가이드 상한(800줄) 미만이나 복잡도 높음
- **영향**: 유지보수 시 인지 부하
- **수정안**: 이미 webhook-crypto, webhook-http로 분리 진행 중. 추가 분리는 불필요

### M-3. Nice/KIS 어댑터 스텁 상태
- **위치**: `adapters/nice-acquirer.adapter.ts`, `adapters/kis-acquirer.adapter.ts`
- **증상**: 모든 메서드가 `throw new Error('계약 완료 후 구현')`
- **영향**: 실서비스 전환 시 구현 필요 (현재는 Mock만 동작)
- **수정안**: 실서비스 전환 시점에 구현. 현재는 TODO 문서화만

### M-4. 토큰 갱신 라이프사이클 테스트 부재
- **위치**: 테스트 전반
- **증상**: API 키 발급/검증은 테스트되나, 키 만료→재발급→기존 키 무효화 흐름 미테스트
- **영향**: 키 로테이션 시 예기치 않은 동작 가능
- **수정안**: E2E 테스트에 키 로테이션 시나리오 추가

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **Zero `any`** | 전체 모듈 `any` 타입 0건. unknown + 타입가드 철저 |
| **PCI DSS 3.4** | 카드 토큰화 AES-256-GCM, PAN 평문 저장 없음 |
| **어댑터 패턴** | AcquirerProvider DI 팩토리로 VAN 교체 무중단 |
| **9단계 결제 파이프라인** | 멱등성 키 → FDS → 수수료 → 카드사 → 감사로그 순서 보장 |
| **BigInt 정밀도** | 금융 계산 전체 BigInt, DTO 변환 시 number 직렬화 |
| **테스트 8.9/10** | 154+ 유닛 + 11 E2E, 보안 테스트 9/10 |
| **SRP 준수** | 서비스당 단일 책임, 크로스 의존 최소화 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 2h | 없음 |
| 2 | C-2 + C-3 | 3h | 없음 (함께 수정) |
| 3 | H-3 | 1h | 없음 |
| 4 | H-2 | 2h | 없음 |
| 5 | H-1 | 1h | TransformInterceptor 확인 |
| 6 | M-4 | 2h | 없음 |

> C-1~C-3은 보안 이슈로 다음 Sprint 전 즉시 수정 권장
