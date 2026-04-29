# PG System API

NestJS 기반 PG 관리시스템 백엔드 API. 결제·정산·보안·관리 기능을 제공합니다.

## 실행

```bash
# 개발 서버 (포트 4000)
pnpm --filter api dev

# 프로덕션 빌드
pnpm --filter api build
pnpm --filter api start
```

## API 엔드포인트

### 인증 (Auth)

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | /api/v1/auth/login | 로그인 | 없음 |
| POST | /api/v1/auth/mfa/verify | MFA 검증 | JWT |
| POST | /api/v1/auth/mfa/setup | MFA 설정 | JWT |
| POST | /api/v1/auth/refresh | 토큰 갱신 | Refresh Token |
| POST | /api/v1/auth/logout | 로그아웃 | JWT |

### 사용자 관리

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/users | 사용자 목록 | USER_READ |
| POST | /api/v1/users | 사용자 생성 | USER_CREATE |
| GET | /api/v1/users/:id | 사용자 상세 | USER_READ |
| PUT | /api/v1/users/:id | 사용자 수정 | USER_UPDATE |
| DELETE | /api/v1/users/:id | 사용자 삭제 | USER_DELETE |

### 역할/권한

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/roles | 역할 목록 | ROLE_READ |
| POST | /api/v1/roles | 역할 생성 | ROLE_CREATE |
| PUT | /api/v1/roles/:id | 역할 수정 | ROLE_UPDATE |
| DELETE | /api/v1/roles/:id | 역할 삭제 | ROLE_DELETE |
| GET | /api/v1/permissions | 전체 권한 목록 | ROLE_READ |

### 가맹점

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/merchants | 가맹점 목록 | MERCHANT_READ |
| POST | /api/v1/merchants | 가맹점 등록 | MERCHANT_CREATE |
| GET | /api/v1/merchants/:id | 가맹점 상세 | MERCHANT_READ |
| PUT | /api/v1/merchants/:id | 가맹점 수정 | MERCHANT_UPDATE |

### 대리점

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/agents | 대리점 목록 | AGENT_READ |
| POST | /api/v1/agents | 대리점 등록 | AGENT_CREATE |
| GET | /api/v1/agents/:id | 대리점 상세 | AGENT_READ |
| PUT | /api/v1/agents/:id | 대리점 수정 | AGENT_UPDATE |
| GET | /api/v1/agents/:id/tree | 하위 대리점 트리 | AGENT_READ |

### 거래

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/transactions | 거래 목록 (필터·페이지네이션) | TRANSACTION_READ |
| GET | /api/v1/transactions/:id | 거래 상세 | TRANSACTION_READ |
| GET | /api/v1/transactions/stats | 거래 통계 | TRANSACTION_READ |

### 정산

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/settlements | 정산 목록 | SETTLEMENT_READ |
| POST | /api/v1/settlements/calculate | 정산 산출 | SETTLEMENT_CREATE |
| POST | /api/v1/settlements/:id/confirm | 정산 확정 | SETTLEMENT_APPROVE |
| GET | /api/v1/settlements/:id | 정산 상세 | SETTLEMENT_READ |

### 수수료

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/commissions/pg-margins | PG 기본 마진 | COMMISSION_READ |
| GET | /api/v1/commissions/agents/:id | 대리점 수수료 | COMMISSION_READ |
| PUT | /api/v1/commissions/agents/:id | 대리점 수수료 설정 | COMMISSION_MANAGE |
| GET | /api/v1/commissions/merchants/:id | 가맹점 수수료 | COMMISSION_READ |
| PUT | /api/v1/commissions/merchants/:id | 가맹점 수수료 설정 | COMMISSION_MANAGE |

### 입금 대사

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/deposits | 입금 목록 | DEPOSIT_READ |
| POST | /api/v1/deposits | 입금 등록 | DEPOSIT_CREATE |
| POST | /api/v1/deposits/reconcile | 자동 대사 | DEPOSIT_RECONCILE |
| POST | /api/v1/deposits/:id/match | 수동 매칭 | DEPOSIT_RECONCILE |

### PG 게이트웨이 — 결제 (가맹점용)

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | /pg/v1/payments | 결제 주문 생성 | Basic Auth + IP |
| POST | /pg/v1/payments/confirm | 결제 승인 확정 | Basic Auth + IP |
| POST | /pg/v1/payments/:paymentKey/cancel | 결제 취소 | Basic Auth + IP |
| GET | /pg/v1/payments/orders/:orderId | 주문번호로 조회 | Basic Auth + IP |
| GET | /pg/v1/payments/:paymentKey | 결제키로 조회 | Basic Auth + IP |

### PG 게이트웨이 — 가상계좌

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | /pg/v1/virtual-accounts/confirm | 가상계좌 발급 확정 | Basic Auth + IP |
| POST | /pg/v1/virtual-accounts/deposit-callback | 입금 콜백 (은행→PG) | 공개 |

### PG 게이트웨이 — 웹훅

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| PUT | /pg/v1/webhooks/config | 웹훅 설정 업데이트 | Basic Auth + IP |
| GET | /pg/v1/webhooks/config | 웹훅 설정 조회 | Basic Auth + IP |
| GET | /pg/v1/webhooks/events | 이벤트 발송 내역 | Basic Auth + IP |

### PG 게이트웨이 — API 키 (관리자용)

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| POST | /pg/v1/api-keys | API 키 발급 | PG_API_MANAGE |
| GET | /pg/v1/api-keys | API 키 목록 | PG_API_MANAGE |
| DELETE | /pg/v1/api-keys/:id | API 키 폐기 | PG_API_MANAGE |

### 보안

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/security/audit-logs | 감사 로그 | AUDIT_READ |
| GET | /api/v1/security/risk-alerts | 리스크 알림 | RISK_READ |
| PUT | /api/v1/security/risk-alerts/:id/resolve | 리스크 해결 | RISK_MANAGE |
| GET | /api/v1/security/login-history | 로그인 이력 | AUDIT_READ |
| GET | /api/v1/security/audit-chain/verify | 해시 체인 검증 | AUDIT_READ |
| GET | /api/v1/security/integrity/status | 파일 무결성 상태 | SYSTEM_MANAGE |

### 대시보드

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/dashboard/summary | 요약 통계 | DASHBOARD_READ |
| GET | /api/v1/dashboard/transactions | 거래 통계 | DASHBOARD_READ |
| GET | /api/v1/dashboard/settlements | 정산 통계 | DASHBOARD_READ |
| GET | /api/v1/dashboard/daily-trend | 일일 추이 | DASHBOARD_READ |
| GET | /api/v1/dashboard/top-merchants | 상위 가맹점 | DASHBOARD_READ |
| GET | /api/v1/dashboard/top-agents | 상위 대리점 | DASHBOARD_READ |

### 시스템

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| GET | /api/v1/system/codes | 시스템 코드 목록 | SYSTEM_MANAGE |
| POST | /api/v1/system/codes | 코드 생성 | SYSTEM_MANAGE |
| GET | /api/v1/system/holidays | 공휴일 목록 | SYSTEM_MANAGE |
| GET | /api/v1/system/menus | 메뉴 트리 | SYSTEM_MANAGE |

### 헬스체크 / 메트릭 (인증 불필요)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/v1/health | 전체 헬스체크 |
| GET | /api/v1/health/ready | Readiness Probe |
| GET | /api/v1/health/live | Liveness Probe |
| GET | /metrics | Prometheus 메트릭 |

## 인증 방식

### 1. 관리자 인증 (JWT + MFA)

```
Authorization: Bearer <access_token>
```

- Access Token: 15분 만료
- Refresh Token: 7일 만료 (HttpOnly 쿠키)
- MFA: TOTP 기반 2차 인증 (PCI DSS 8.4.2)

### 2. 가맹점 PG API 인증 (Basic Auth + IP)

```
Authorization: Basic <base64(apiKey:secretKey)>
```

- API Key: 가맹점별 발급, 관리자가 관리
- Secret Key: 발급 시 1회만 노출, bcrypt 해시 저장
- IP 화이트리스트: 가맹점 등록 IP에서만 접근 허용

## Swagger 문서

개발 환경에서 자동 활성화:

```
http://localhost:4000/api/docs
```

프로덕션에서는 보안을 위해 비활성화됩니다.

## 데이터베이스

```bash
# Prisma Studio (DB GUI)
pnpm --filter api prisma:studio

# 마이그레이션 실행
pnpm --filter api prisma:migrate

# 시드 데이터
pnpm --filter api prisma:seed

# 타입 생성
pnpm --filter api prisma:generate
```

## 테스트

```bash
# 단위 테스트 (39 suites / 517 tests)
pnpm --filter api test

# E2E 테스트 (73항목 + 풀 비즈니스 플로우 9단계)
pnpm --filter api test:e2e

# 타입 체크
pnpm --filter api type-check

# 린트
pnpm --filter api lint
```
