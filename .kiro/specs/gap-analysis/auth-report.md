# Auth 모듈 Gap Report (2/15)

> 점검일: 2026-03-07 | 방법: CC-SDD 4-Agent 병렬 분석

## 종합 등급: A (91/100)

| 영역 | 등급 | 점수 |
|------|------|------|
| 서비스 레이어 | A+ | 96 |
| 컨트롤러/DTO | A | 90 |
| 테스트 커버리지 | A- | 88 |
| 모듈 구조/보안 | A | 92 |

---

## CRITICAL (즉시 수정 필요)

### C-1. ChangePasswordDto 비밀번호 복잡도 검증 부재
- **위치**: `dto/change-password.dto.ts`
- **증상**: `@MinLength(12)` 만 존재. 대소문자/숫자/특수문자 혼합 정규식(`@Matches`) 없음
- **영향**: PCI DSS 8.3.6 미준수. 약한 비밀번호(예: `aaaaaaaaaaaa`) 허용
- **수정안**: `@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)` 추가. LoginDto의 기존 패턴과 통일

### C-2. MFA 검증 시 토큰 타입 미확인
- **위치**: `auth.service.ts` — `verifyMfa()` 메서드
- **증상**: MFA 검증 시 전달받은 JWT가 `mfa-pending` 타입인지 확인하지 않음
- **영향**: 일반 accessToken으로 MFA 검증 우회 가능성
- **수정안**: `verifyMfa()` 진입 시 토큰 payload의 `type === 'mfa-pending'` 체크 추가

---

## HIGH (Sprint 내 수정 권장)

### H-1. 타이밍 공격 취약점 (사용자 존재 여부 노출)
- **위치**: `auth.service.ts` — `login()` 메서드
- **증상**: 사용자 미존재 시 즉시 에러 반환 vs 존재 시 bcrypt 비교 후 에러. 응답 시간 차이로 사용자 존재 유추 가능
- **영향**: 사용자 열거(User Enumeration) 공격 가능
- **수정안**: 사용자 미존재 시에도 더미 bcrypt.compare 실행하여 응답 시간 균일화

### H-2. Refresh Token 탈취 시 Rotation 부재
- **위치**: `auth.service.ts` — `refreshToken()` 메서드
- **증상**: refresh token 사용 시 기존 토큰 무효화 + 새 토큰 발급(rotation) 없음
- **영향**: 탈취된 refresh token으로 7일간 무제한 토큰 갱신 가능
- **수정안**: Refresh Token Rotation 패턴 구현 — 사용 시 기존 무효화 + 새 토큰 발급

### H-3. MFA 비활성화 기능 없음
- **위치**: auth.controller.ts / auth.service.ts
- **증상**: MFA 설정(`/mfa/setup`) + 검증(`/mfa/verify`) 존재하나 비활성화 엔드포인트 없음
- **영향**: 기기 분실 시 MFA 해제 불가, 사용자 잠김(lockout)
- **수정안**: `POST /auth/mfa/disable` 엔드포인트 추가 (비밀번호 재확인 필수)

### H-4. MFA Backup Code 미구현
- **위치**: auth.service.ts
- **증상**: TOTP만 존재. 백업/복구 코드 없음
- **영향**: 인증 앱 삭제/기기 분실 시 계정 영구 잠김
- **수정안**: MFA 설정 시 8자리 백업 코드 10개 생성, 1회용 사용 로직 추가

### H-5. 비밀번호 정책 불일치
- **위치**: `dto/login.dto.ts` vs `dto/change-password.dto.ts`
- **증상**: LoginDto는 `@MinLength(8)` + 복잡도 regex, ChangePasswordDto는 `@MinLength(12)` regex 없음
- **영향**: 비밀번호 변경 시 로그인보다 약한 비밀번호 허용 가능
- **수정안**: 공통 비밀번호 정책 상수/데코레이터로 통일 (최소 12자 + 복잡도)

### H-6. loginId 정규식 과도한 허용
- **위치**: `dto/login.dto.ts`
- **증상**: `@Matches` 패턴이 너무 허용적 (특수문자 등)
- **영향**: 비정상 로그인 ID 입력으로 예기치 않은 동작 가능
- **수정안**: `^[a-zA-Z0-9._@-]+$` 수준으로 제한

### H-7. 로그아웃 시 토큰 재전송 필요
- **위치**: `auth.controller.ts` — `logout()`
- **증상**: 로그아웃에 refreshToken을 body로 전달해야 함. 클라이언트가 토큰 분실 시 로그아웃 불가
- **영향**: 토큰 유실 상황에서 세션 정리 불가
- **수정안**: HttpOnly 쿠키 기반이면 서버에서 직접 처리, 아니면 accessToken만으로 관련 refresh 전체 무효화

---

## MEDIUM (다음 Sprint 수정)

### M-1. MFA E2E 테스트 부재
- **위치**: `test/auth.e2e-spec.ts`
- **증상**: 11개 E2E 테스트 중 MFA 전체 플로우(설정→검증→로그인+MFA) 없음
- **영향**: MFA 통합 시나리오 회귀 검증 불가
- **수정안**: MFA 설정→검증→MFA 필수 로그인 E2E 시나리오 추가

### M-2. 동시성 테스트 부재
- **위치**: 테스트 전반
- **증상**: 동시 로그인 시도, 동시 토큰 갱신 등 동시성 시나리오 미테스트
- **영향**: Race condition으로 인한 보안 우회 가능성 미검증
- **수정안**: Promise.all 기반 동시 요청 테스트 추가

### M-3. 비밀번호 변경 후 기존 토큰 무효화 테스트 부재
- **위치**: `auth.service.spec.ts`
- **증상**: changePassword 테스트는 성공 케이스만. 변경 후 기존 세션 무효화 검증 없음
- **영향**: 비밀번호 변경 후에도 이전 토큰으로 접근 가능할 수 있음
- **수정안**: 비밀번호 변경→기존 refreshToken 거부 시나리오 테스트

### M-4. auth.service.ts 파일 크기
- **위치**: `auth.service.ts` (795줄)
- **증상**: 800줄 상한 근접. login/mfa/token/password 4가지 책임
- **영향**: 향후 기능 추가 시 상한 초과 예상
- **수정안**: MfaService, TokenService 분리 고려 (급하지 않음)

---

## 강점 (유지/참고)

| 항목 | 상세 |
|------|------|
| **MFA 구현** | TOTP + AES-256-GCM 암호화 저장, authenticator 앱 연동 |
| **계정 잠금** | 5회 실패 → 30분 잠금, lockUntil 필드 관리 |
| **bcrypt 12 rounds** | PCI DSS 8.3.2 준수 |
| **JWT 이중 토큰** | access(15분) + refresh(7일), HttpOnly 쿠키 |
| **Rate Limiting** | 로그인 5회/분, 비밀번호변경 3회/분 |
| **테스트 61건** | 32 unit + 18 security + 11 E2E = 85-88% 커버리지 |
| **감사 로그** | AuditInterceptor로 인증 관련 모든 행위 기록 |
| **Zero `any`** | 전체 모듈 `any` 타입 0건 |

---

## 수정 우선순위 로드맵

| 순위 | ID | 예상 작업량 | 의존성 |
|------|----|------------|--------|
| 1 | C-1 | 0.5h | 없음 |
| 2 | C-2 | 1h | 없음 |
| 3 | H-1 | 1h | 없음 |
| 4 | H-2 | 3h | DB 스키마 (refresh token 테이블) |
| 5 | H-5 | 0.5h | C-1과 함께 |
| 6 | H-3 + H-4 | 4h | 함께 수정 |
| 7 | H-6 | 0.5h | 없음 |
| 8 | H-7 | 1h | H-2 이후 |
| 9 | M-1~M-3 | 3h | 테스트 |

> C-1, C-2는 보안 이슈로 즉시 수정 권장
