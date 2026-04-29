# PG System 외부 검증 요청서

> 작성일: 2026-03-03
> 버전: 1.0
> 프로젝트: PG System (결제대행 시스템)
> 보안등급: 🔴 최고 (금융/결제 도메인)

---

## 1. 검증 요청 개요

### 1.1 목적

본 문서는 PG System의 **보안성, 규제 준수, 코드 품질**에 대한 외부 전문가 검증을 요청하기 위해 작성되었습니다.

### 1.2 검증 범위

| 영역 | 설명 |
|------|------|
| **PCI DSS 4.0.1 준수** | 결제 데이터 보호, 접근 제어, 감사 로그 등 36개 항목 |
| **한국 전자금융거래법** | 전자금융감독규정 기반 보안 요건 |
| **코드 품질** | TypeScript strict 모드, 테스트 커버리지, 아키텍처 |
| **인프라 보안** | Docker 컨테이너, 네트워크 격리, 시크릿 관리 |

### 1.3 시스템 규모

| 항목 | 수치 |
|------|------|
| 백엔드 모듈 | 15개 |
| DB 테이블 | 34개 |
| API 엔드포인트 | 101개 |
| 테스트 스위트 | 51개 |
| 테스트 케이스 | 714개 (전체 PASS) |
| 코드 라인 수 | ~25,000+ (TypeScript) |

---

## 2. 기술 스택

| 계층 | 기술 |
|------|------|
| **Backend** | NestJS 10 + TypeScript 5 (strict mode) |
| **ORM** | Prisma 5 (PostgreSQL) |
| **Database** | PostgreSQL 16 |
| **Authentication** | JWT (관리자) + Basic Auth (PG Gateway 가맹점) |
| **MFA** | TOTP (RFC 6238) |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Shared** | @pg-system/shared (상수, 타입, 유틸리티) |
| **Container** | Docker + docker-compose |
| **Frontend** | Next.js 15 (관리자/가맹점/대리점 포탈) |

---

## 3. 아키텍처 개요

### 3.1 모듈 구조

```
apps/api/src/modules/
├── auth/           # JWT + MFA(TOTP) 인증, 역할 기반 접근 제어
├── users/          # 사용자 CRUD, 비밀번호 정책
├── merchants/      # 가맹점 관리, API 키 발급
├── agents/         # 대리점(총판) 관리, 계층 구조
├── transactions/   # 거래 조회/통계
├── deposits/       # 입금(충전) 처리
├── commissions/    # 수수료 계약 관리
├── settlements/    # 정산 처리 (일별/주별/월별)
├── pg-gateway/     # PG 결제 게이트웨이 (핵심)
│   ├── controllers/  # 결제 요청/승인/취소/조회 API
│   ├── services/     # 비즈니스 로직 (Confirm, Cancel, FDS, Fee 등)
│   ├── mock-acquirer/ # Mock 카드사 시뮬레이터
│   ├── guards/       # IP 화이트리스트, Basic Auth
│   └── dto/          # 요청/응답 DTO (Zod 검증)
├── security/       # 보안 서비스 (감사 로그, 해시 체인, FIM)
├── notifications/  # 알림 서비스
├── dashboard/      # 관리자 대시보드 API
├── health/         # 헬스체크
├── metrics/        # 시스템 메트릭
└── system/         # 시스템 설정
```

### 3.2 핵심 보안 아키텍처

```
[가맹점 서버] → Basic Auth + IP Whitelist → [PG Gateway]
     │                                           │
     │  paymentKey + orderId + amount             │
     ▼                                           ▼
[결제 요청] → [FDS 5단계 검사] → [Mock 카드사] → [DB 트랜잭션]
                   │                                    │
                   │ R1~R5 룰 평가                      │ ACID 보장
                   ▼                                    ▼
            [리스크 알림]                        [감사 로그 기록]
                                                       │
                                                       ▼
                                              [해시 체인 무결성]
```

### 3.3 데이터 격리 원칙

- **merchantId 격리**: 모든 가맹점 데이터는 `merchant_id` 기준으로 격리
- **OwnershipInterceptor**: 요청 사용자가 리소스 소유자인지 자동 검증
- **JwtAuthGuard**: 관리자 API에 역할 기반 접근 제어 (ADMIN, SUPER_ADMIN)
- **PgBasicAuthGuard**: PG Gateway API에 가맹점 인증 (API Key + Secret Key)

---

## 4. PCI DSS 4.0.1 준수 현황

### 4.1 전체 요약

| 카테고리 | 총 항목 | 완료 | 미완료 | 준수율 |
|---------|--------|------|--------|-------|
| 인증/접근제어 | 10 | 10 | 0 | 100% |
| 데이터 보호 | 6 | 5 | 1 | 83% |
| 취약점 관리 | 6 | 6 | 0 | 100% |
| 모니터링/로깅 | 8 | 6 | 2 | 75% |
| 네트워크 보안 | 3 | 3 | 0 | 100% |
| 시스템 구성 | 3 | 3 | 0 | 100% |
| **합계** | **36** | **33** | **3** | **92%** |

### 4.2 미완료 항목 (인프라 레벨)

| PCI DSS | 항목 | 상태 | 사유 |
|---------|------|------|------|
| 4.2.1 | TLS 1.3 인증서 | ⚠️ 인프라 | 프로덕션 배포 시 적용 (개발 환경은 HTTP) |
| 10.4.1 | 보안 이벤트 실시간 알림 | ⚠️ 인프라 | 알림 서비스 구현 완료, 외부 채널(Slack/이메일) 연동 대기 |
| 11.3.1 | 외부 취약점 스캔 (ASV) | ⚠️ 외부 | 공인 스캔 벤더(ASV) 계약 필요 |

### 4.3 주요 준수 항목 상세

**인증 (PCI DSS Req 7, 8)**
- JWT 토큰 만료: Access 15분, Refresh 7일
- MFA(TOTP) 필수 (관리자 로그인)
- 비밀번호 정책: 최소 12자, 복잡도 검증
- 로그인 실패 5회 → 계정 잠금 30분
- 세션 고정 공격 방지 (로그인 시 토큰 재발급)

**데이터 보호 (PCI DSS Req 3, 4)**
- 카드번호 마스킹: `****-****-****-1234` 형태만 저장
- AES-256-GCM 암호화 (민감 데이터)
- API Key: `sk_live_` 프리픽스 + bcrypt 해시 저장
- 환경변수 분리 (하드코딩 금지)

**취약점 관리 (PCI DSS Req 6)**
- TypeScript strict 모드 (컴파일 타임 방어)
- Zod 스키마 기반 입력 검증
- SQL 인젝션 방지 (Prisma ORM, Raw SQL 금지)
- XSS 방지 (CSP strict-dynamic)
- 에러 메시지에 내부 정보 비노출

**모니터링 (PCI DSS Req 10, 11)**
- 감사 로그: 모든 금융 거래 + 관리자 행위 기록
- 해시 체인: SHA-256 기반 감사 로그 무결성 검증
- FIM: 핵심 파일 무결성 모니터링 (SHA-256 베이스라인)
- FDS: 5가지 이상거래 탐지 룰 (실시간 평가)
- Rate Limiting: IP당 분당 10회 제한

---

## 5. 검증 증빙 자료 목록

> 상세 내용은 `docs/external-audit-checklist.md` 참조

### A. 인증/접근 제어 (5건)

| ID | 항목 | 참조 파일 | 수집 방법 |
|----|------|----------|----------|
| A-1 | JWT + MFA(TOTP) 인증 플로우 | `modules/auth/auth.service.ts` | 코드 리뷰 + E2E 테스트 |
| A-2 | 역할 기반 접근 제어 (RBAC) | `common/guards/roles.guard.ts` | 코드 리뷰 |
| A-3 | 비밀번호 정책 (12자+복잡도) | `modules/auth/auth.service.ts` | 단위 테스트 |
| A-4 | 계정 잠금 (5회 실패/30분) | `modules/auth/auth.service.ts` | E2E 테스트 |
| A-5 | PG Gateway Basic Auth + IP 화이트리스트 | `modules/pg-gateway/guards/` | 코드 리뷰 + 테스트 |

### B. 데이터 보호 (6건)

| ID | 항목 | 참조 파일 | 수집 방법 |
|----|------|----------|----------|
| B-1 | 카드번호 마스킹 | `mock-acquirer/mock-acquirer.service.ts` | 코드 리뷰 |
| B-2 | AES-256-GCM 암호화 | `modules/security/security.service.ts` | 코드 리뷰 |
| B-3 | FDS 이상거래 탐지 (5룰) | `services/fds-rule-engine.service.ts` | 단위 테스트 |
| B-4 | API Key 해시 저장 (bcrypt) | `services/api-key.service.ts` | 코드 리뷰 |
| B-5 | BigInt 정수 연산 (금액 정밀도) | `services/pg-fee-calculator.service.ts` | 단위 테스트 |
| B-6 | 금액 변조 검증 (3단계) | `services/payment-confirm.service.ts` | E2E 테스트 |

### C. 취약점 관리 (5건)

| ID | 항목 | 참조 파일 | 수집 방법 |
|----|------|----------|----------|
| C-1 | Zod 입력 검증 | `modules/pg-gateway/dto/` | 코드 리뷰 |
| C-2 | CSP strict-dynamic | `apps/web/src/middleware.ts` | 코드 리뷰 |
| C-3 | Rate Limiting | `common/guards/throttler.guard.ts` | 테스트 |
| C-4 | 에러 정보 비노출 | `common/filters/` | 코드 리뷰 |
| C-5 | SQL 인젝션 방지 (Prisma ORM) | 전체 서비스 계층 | 코드 리뷰 |

### D. 모니터링/로깅 (4건)

| ID | 항목 | 참조 파일 | 수집 방법 |
|----|------|----------|----------|
| D-1 | 감사 로그 (모든 금융 거래) | `modules/security/security.service.ts` | 코드 리뷰 + DB 확인 |
| D-2 | 해시 체인 무결성 검증 | `security/audit-hash-chain.service.ts` | 단위 테스트 |
| D-3 | FIM 파일 무결성 모니터링 | `security/integrity-monitor.service.ts` | 단위 테스트 |
| D-4 | 웹훅 재시도 (지수 백오프) | `services/webhook-retry.service.ts` | 코드 리뷰 |

### E. 네트워크/시스템 (3건)

| ID | 항목 | 참조 파일 | 수집 방법 |
|----|------|----------|----------|
| E-1 | Docker 컨테이너 격리 | `docker-compose.yml` | 인프라 리뷰 |
| E-2 | 환경변수 분리 | `.env.example` | 설정 리뷰 |
| E-3 | 헬스체크 | `modules/health/` | API 호출 |

---

## 6. 검증 실행 가이드

### 6.1 환경 설정

```bash
# 1. 저장소 클론
git clone <repo-url> pg-system
cd pg-system

# 2. 의존성 설치
pnpm install

# 3. 환경변수 설정
cp .env.example apps/api/.env
# .env 파일에 DATABASE_URL, JWT_SECRET 등 설정

# 4. DB 마이그레이션
cd apps/api
npx prisma migrate deploy
npx prisma db seed
```

### 6.2 검증 명령어

```bash
# ── 4단계 검증 프로토콜 ──

# 1. 타입 검사 (TypeScript strict 모드)
cd apps/api
npx tsc --noEmit

# 2. 린트 검사
npm run lint

# 3. 빌드
npm run build
# 또는
npx nest build

# 4. 테스트 (단위 + 통합)
npm test
# 또는 특정 모듈만
npx jest --testPathPattern="auth"
npx jest --testPathPattern="pg-gateway"
npx jest --testPathPattern="security"
```

### 6.3 Docker E2E 테스트

```bash
# 프로젝트 루트에서
docker-compose -f docker-compose.dev.yml up --build

# E2E 테스트 (73항목 + 풀 비즈니스 플로우 9단계)
cd apps/api
npm run test:e2e
```

### 6.4 주요 테스트 영역

| 테스트 영역 | 테스트 수 | 명령어 |
|------------|----------|--------|
| 인증/인가 | ~80건 | `npx jest auth` |
| PG Gateway | ~120건 | `npx jest pg-gateway` |
| FDS 룰엔진 | ~30건 | `npx jest fds-rule-engine` |
| 결제 승인/취소 | ~60건 | `npx jest payment` |
| 보안 서비스 | ~40건 | `npx jest security` |
| 정산 | ~50건 | `npx jest settlements` |
| 가맹점/대리점 | ~80건 | `npx jest merchants agents` |
| 소유권 검증 | ~30건 | `npx jest ownership` |

---

## 7. 핵심 리뷰 포인트

외부 검증자가 **우선적으로 확인해야 할 영역**입니다.

### 7.1 결제 승인 파이프라인 (최우선)

**파일**: `apps/api/src/modules/pg-gateway/services/payment-confirm.service.ts`

9단계 검증 파이프라인:
1. paymentKey + merchantId 주문 조회 (가맹점 격리)
2. orderId 교차 검증
3. 완료/취소 상태 검증
4. 만료 시간 검증 → EXPIRED 처리
5. **금액 변조 검증** (프론트/백엔드 교차 검증)
6. **FDS 이상거래 검사** (5룰 평가)
7. Mock 카드사 승인 요청
8. **DB 트랜잭션** (ACID 보장: transactions + pg_payment_orders 원자적 업데이트)
9. 웹훅 발송 (best-effort)

### 7.2 FDS 이상거래 탐지 (보안 핵심)

**파일**: `apps/api/src/modules/pg-gateway/services/fds-rule-engine.service.ts`

| 룰 | 조건 | 판정 |
|----|------|------|
| R1 | 단건 500만 원 초과 | BLOCK |
| R2 | 시간당 가맹점 누적 1,000만 원 초과 | BLOCK |
| R3 | 시간당 동일 카드 5회 초과 | BLOCK |
| R4 | 심야(23~05시) 100만 원 초과 | WARN |
| R5 | 30분 내 거절 3회 이상 | BLOCK |

### 7.3 감사 로그 무결성 (규제 핵심)

**파일**: `apps/api/src/modules/security/audit-hash-chain.service.ts`

- SHA-256 해시 체인으로 감사 로그 변조 탐지
- 각 로그 레코드에 이전 해시를 포함하여 체인 구성
- `verifyChain()` 메서드로 전체 체인 무결성 검증 가능
- PCI DSS 10.5.5 준수

### 7.4 수수료 계산 정밀도 (금융 핵심)

**파일**: `apps/api/src/modules/pg-gateway/services/pg-fee-calculator.service.ts`

- **BigInt 정수 연산**으로 부동소수점 오차 원천 차단
- 3단계 우선순위 조회: `merchant_item_fees` → `merchant_commissions` → `pg_default_margins`
- 캐시 TTL 적용 (불필요한 DB 조회 방지)
- 반올림 공식: `(amount * rateScaled + 5000n) / 10000n`

---

## 8. 알려진 제한 사항

현재 시스템은 **데모/PoC 단계**이며, 프로덕션 서비스를 위해 아래 항목의 추가 구현이 필요합니다.

| 항목 | 현재 상태 | 프로덕션 요구 |
|------|----------|--------------|
| 카드사 연동 | Mock 카드사 | 실제 VAN/카드사 API 연동 |
| 카드 토큰화 | 마스킹만 구현 | PCI DSS 레벨 토큰화 시스템 |
| 결제창 SDK | 데모 폼 | 가맹점 임베드용 SDK/iframe |
| 자동 정산 배치 | 수동 정산 | 스케줄러 기반 자동 배치 |
| TLS 인증서 | 개발 환경 HTTP | TLS 1.3 인증서 적용 |
| 실시간 알림 | 로그 기록만 | Slack/이메일 외부 채널 연동 |
| 외부 취약점 스캔 | 미실시 | ASV(공인 스캔 벤더) 정기 스캔 |

---

## 9. 참조 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| PRD | `docs/PRD.md` | 제품 요구사항 정의서 |
| 아키텍처 | `docs/architecture.md` | 시스템 아키텍처 상세 |
| PCI DSS 맵 | `docs/pci-dss-compliance-map.md` | 36개 항목 준수 현황 |
| 감사 체크리스트 | `docs/external-audit-checklist.md` | 22개 증빙 자료 목록 |
| 법적 준수 | `docs/legal-compliance.md` | 전자금융거래법 준수 현황 |
| 프로덕션 로드맵 | `docs/PRODUCTION_ROADMAP.md` | 프로덕션 전환 계획 |
| 프로덕션 체크리스트 | `docs/production-checklist.md` | 배포 전 확인 사항 |
| 테스트 가이드 | `docs/full-test-guide.md` | 전체 테스트 실행 가이드 |
| Prisma 스키마 | `apps/api/prisma/schema.prisma` | DB 스키마 (34 테이블) |

---

## 10. 연락처

| 역할 | 담당 | 비고 |
|------|------|------|
| 프로젝트 총괄 | Jayden | 검증 범위 협의 |

---

*본 문서는 PG System 외부 검증 요청을 위해 작성되었으며, 시스템의 현재 상태를 정확하게 반영합니다.*
