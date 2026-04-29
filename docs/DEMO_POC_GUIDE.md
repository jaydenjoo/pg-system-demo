# PG System 시연/PoC 설명서

> **버전**: 2026-03-05 | **소요 시간**: 15~20분
> **대상**: 투자자, 사업 파트너, 기술 심사위원, 내부 검증

---

## 1. 시스템 개요

### PG System이란?
한국 금융감독원(FSS) 기준에 부합하는 **결제대행(PG) 시스템**입니다.
가맹점이 카드 결제를 받을 수 있도록 중간에서 결제를 처리하고, 정산까지 관리합니다.

> 비유: "토스페이먼츠나 KG이니시스 같은 PG사를 직접 만든 것"

### 기술 스택

| 계층 | 기술 | 역할 |
|------|------|------|
| 프론트엔드 | Next.js 15, React, shadcn/ui, Tailwind CSS | 관리자/가맹점/대리점 대시보드, 결제 페이지 |
| 백엔드 | NestJS, Prisma ORM, PostgreSQL 16 | REST API, 비즈니스 로직, 데이터 관리 |
| 인증 | JWT + MFA(TOTP) / Basic Auth | 관리자: JWT+MFA, 가맹점 API: Basic Auth |
| 보안 | AES-256-GCM, HMAC-SHA256, FDS, CSP | 암호화, 웹훅 서명, 이상거래탐지, XSS 방어 |
| 인프라 | Docker, Nginx | 컨테이너 배포, 리버스 프록시 |
| 테스트 | Jest + Vitest | 58 suites / 818 tests (ALL PASS) |

### 현재 규모

| 항목 | 수치 |
|------|------|
| API 엔드포인트 | 101개 |
| DB 테이블 | 35개 |
| 백엔드 모듈 | 15개 |
| 웹 페이지 | 38개 |
| 자동화 테스트 | 818개 (100% 통과) |
| 테스트 커버리지 | ~59% (목표 80%) |

---

## 2. 환경 준비

### 방법 A: Docker 실행 (권장)

```bash
# 프로젝트 루트에서
cd /Users/jayden/project/pg-system

# 전체 서비스 실행 (DB + API + Web + Nginx)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# DB 마이그레이션 + 시드 데이터
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed
```

### 방법 B: 로컬 직접 실행

```bash
# 1. PostgreSQL 실행 (Docker 또는 로컬)
docker compose up -d db

# 2. 의존성 설치
pnpm install

# 3. DB 마이그레이션 + 시드
cd apps/api
npx prisma migrate deploy
npx prisma db seed

# 4. API 서버 (터미널 1)
cd apps/api && npm run dev     # → http://localhost:4000

# 5. 웹 대시보드 (터미널 2)
cd apps/web && npm run dev     # → http://localhost:3500
```

### 접속 URL 정리

| 서비스 | URL | 설명 |
|--------|-----|------|
| 웹 대시보드 | http://localhost:3500 | 관리자/가맹점/대리점 UI |
| API 서버 | http://localhost:4000 | REST API |
| Swagger 문서 | http://localhost:4000/api/docs | API 문서 (Try it out 가능) |
| PostgreSQL | localhost:5432 | DB (user: postgres / password: postgres) |

---

## 3. 로그인 계정 정보

시드 데이터 실행 시 아래 계정이 자동 생성됩니다.

### 관리자 (전체 권한)

| 항목 | 값 |
|------|-----|
| URL | http://localhost:3500/login |
| 이메일 | `admin@pgsystem.co.kr` |
| 비밀번호 | `Admin1234!@` |
| 역할 | SUPER_ADMIN |
| 대시보드 | `/dashboard` |

### 가맹점 테스트 계정

| 항목 | 값 |
|------|-----|
| URL | http://localhost:3500/login |
| 이메일 | `merchant_test@pgsystem.co.kr` |
| 비밀번호 | `Admin1234!@` |
| 역할 | MERCHANT_OWNER |
| 대시보드 | `/m/dashboard` |

### 대리점 테스트 계정

| 항목 | 값 |
|------|-----|
| URL | http://localhost:3500/login |
| 이메일 | `agent_test@pgsystem.co.kr` |
| 비밀번호 | `Admin1234!@` |
| 역할 | AGENT_OWNER |
| 대시보드 | `/a/dashboard` |

### PG API 인증 키 (가맹점용)

| 항목 | 값 |
|------|-----|
| Client Key | `ck_test_demo_0000000000000000` |
| Secret Key | `test_sk_demo_0000000000000000000000000000000000000000000000000000` |
| 인증 방식 | HTTP Basic Auth (username = secret_key, password = 빈 문자열) |

---

## 4. 테스트 카드 정보

### 정상 결제

| 항목 | 값 |
|------|-----|
| 카드번호 | `4111111111111111` (13~19자리 아무 숫자) |
| 유효기간 | `12/28` (미래 날짜 아무거나) |
| CVV | `123` (3자리 아무 숫자) |

### 실패 시뮬레이션 (금액 끝 2자리로 제어)

| 금액 | 끝 2자리 | 결과 | 에러 코드 |
|------|----------|------|-----------|
| 10,000원 | 00 | 정상 승인 | - |
| 10,099원 | 99 | 카드사 거절 | ACQ_001 |
| 10,098원 | 98 | 타임아웃 | ACQ_002 |
| 10,097원 | 97 | 잔액 부족 | ACQ_003 |

> Mock 카드사가 금액 끝 2자리를 보고 성공/실패를 결정합니다.
> 실제 운영 시에는 VAN/카드사 API로 교체됩니다.

---

## 5. 시연 시나리오 (15~20분)

### Step 1: 관리자 대시보드 (3분)

**목적**: 시스템 전체를 한눈에 보여주기

1. http://localhost:3500/login 접속
2. 관리자 계정 로그인 (`admin@pgsystem.co.kr` / `Admin1234!@`)
3. 대시보드 메인 화면 확인
   - 거래 현황, 통계 위젯
   - 좌측 사이드바 메뉴 구성 소개
4. 주요 메뉴 빠르게 훑기:
   - **가맹점 관리** (`/merchants`) — 가맹점 목록, 등록, 상세
   - **대리점 관리** (`/agents`) — 대리점 목록, 상세
   - **거래 내역** (`/transactions`) — 전체 거래 조회
   - **정산 관리** (`/settlements`) — 가맹점/대리점 정산
   - **보안 관리** (`/security`) — 감사 로그, API 키 관리

> **핵심 멘트**: "PG사 운영에 필요한 가맹점 관리, 거래 조회, 정산, 보안까지 한 곳에서 관리합니다."

---

### Step 2: 결제 체크아웃 — 성공 (3분)

**목적**: 실제 결제 프로세스 시연

1. 새 탭에서 http://localhost:3500/checkout 접속
2. 결제 폼 확인:
   - 주문번호: 자동 생성
   - 주문명: `테스트 상품 결제`
   - 결제 금액: `10000` (1만원)
3. 카드 정보 입력:
   - 카드번호: `4111111111111111`
   - 유효기간: `12/28`
   - CVV: `123`
4. **"결제하기" 클릭**
5. 결제 성공 화면 확인:
   - paymentKey (고유 결제 키)
   - 승인 시각
   - 승인 금액

> **핵심 멘트**: "가맹점 고객이 이 화면에서 결제합니다. 카드 정보는 토큰화되어 원본이 저장되지 않으며, Mock 카드사를 통해 즉시 승인됩니다."

---

### Step 3: 결제 실패 시뮬레이션 (2분)

**목적**: 에러 핸들링 시연

1. 결제 폼으로 돌아가기
2. 금액을 `10099`로 변경 (끝 2자리 99 = 카드사 거절)
3. **결제 시도 → 실패 화면 확인**
   - 에러 코드: `ACQ_001`
   - 에러 메시지: 카드사 거절
4. (선택) 금액 `10097`로 잔액 부족도 시연

> **핵심 멘트**: "실제 카드사 거절, 잔액 부족 등 다양한 실패 상황을 시뮬레이션합니다. 에러 코드 기반으로 가맹점이 원인을 즉시 파악할 수 있습니다."

---

### Step 4: 대시보드에서 거래 확인 (2분)

**목적**: 실시간 거래 추적 시연

1. 관리자 대시보드 탭으로 전환
2. **거래 내역** (`/transactions`) 페이지 이동
3. 방금 결제한 건 확인:
   - 성공 건: 상태 `APPROVED` (녹색)
   - 실패 건: 상태 `FAILED` (빨간색)
4. 거래 상세 클릭 → paymentKey, 금액, 카드 정보(마스킹), 승인 시각

> **핵심 멘트**: "결제 발생 즉시 대시보드에 반영됩니다. 실시간 거래 모니터링이 가능합니다."

---

### Step 5: 가맹점/대리점 포탈 (3분)

**목적**: 역할별 분리된 포탈 시연

#### 가맹점 포탈
1. 로그아웃 후 가맹점 계정으로 로그인
   - `merchant_test@pgsystem.co.kr` / `Admin1234!@`
2. 가맹점 전용 대시보드 (`/m/dashboard`) 확인
   - 내 가맹점 거래만 보임 (데이터 격리)
   - 정산 현황 (`/m/settlements`)
   - 웹훅 설정 (`/m/webhooks`)

#### 대리점 포탈
1. 로그아웃 후 대리점 계정으로 로그인
   - `agent_test@pgsystem.co.kr` / `Admin1234!@`
2. 대리점 전용 대시보드 (`/a/dashboard`) 확인
   - 소속 가맹점 목록 (`/a/merchants`)
   - 대리점 정산/수수료 (`/a/settlements`, `/a/commissions`)

> **핵심 멘트**: "관리자, 가맹점, 대리점이 각각 자기 데이터만 볼 수 있습니다. OwnershipInterceptor가 모든 API에서 데이터 격리를 강제합니다."

---

### Step 6: API 문서 & 보안 (4분)

**목적**: 기술 완성도와 보안 수준 시연

#### Swagger API 문서
1. http://localhost:4000/api/docs 접속
2. 주요 API 그룹 소개:
   - **PG Gateway** — 결제 주문 생성, 승인, 조회, 취소
   - **Auth** — 로그인, MFA, 토큰 갱신
   - **Merchants / Agents** — 가맹점/대리점 CRUD
   - **Transactions** — 거래 조회
   - **Settlements** — 정산 관리
3. (선택) "Try it out"으로 API 직접 호출

#### 보안 기능 소개
| 보안 기능 | 설명 |
|-----------|------|
| **FDS (이상거래탐지)** | 금액 상한, IP 기반, 30분 내 중복 차단, 위험 점수 계산 |
| **감사 로그** | 모든 결제/취소 건 해시 체인으로 위변조 방지 기록 |
| **API 키 관리** | 발급/폐기/IP 화이트리스트 |
| **웹훅 서명** | HMAC-SHA256으로 가맹점에 결제 알림 (위변조 검증) |
| **카드 토큰화** | 카드 원본 미저장, AES-256-GCM 암호화 토큰 |
| **MFA(다중인증)** | 관리자 로그인 시 TOTP 인증 |
| **CSP** | strict-dynamic 기반 Content Security Policy (PCI DSS 6.4.3) |
| **Rate Limiting** | API 호출 빈도 제한 |

> **핵심 멘트**: "한국 금융감독원 기준 + PCI DSS 4.0 보안 요구사항을 코드 레벨에서 구현했습니다. 감사 로그는 블록체인처럼 해시 체인으로 위변조가 불가능합니다."

---

## 6. API 직접 테스트 (curl)

Swagger가 아닌 curl로도 바로 테스트할 수 있습니다.

### 6-1. 결제 주문 생성

```bash
curl -X POST http://localhost:4000/pg/v1/payments \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "DEMO-001",
    "amount": 10000,
    "orderName": "데모 상품",
    "paymentMethod": "CARD"
  }'
```

### 6-2. 결제 승인

```bash
curl -X POST http://localhost:4000/pg/v1/payments/confirm \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentKey": "<위 응답의 paymentKey>",
    "orderId": "DEMO-001",
    "amount": 10000,
    "cardNumber": "4111111111111111",
    "installmentMonths": 0
  }'
```

### 6-3. 결제 조회

```bash
curl http://localhost:4000/pg/v1/payments/<paymentKey> \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)"
```

### 6-4. 결제 취소/환불

```bash
curl -X POST http://localhost:4000/pg/v1/payments/<paymentKey>/cancel \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "cancelReason": "고객 요청 취소"
  }'
```

---

## 7. 자동화 테스트 실행

### 전체 테스트 (818개)

```bash
# 프로젝트 루트에서
npm test
```

- API 테스트: 44 suites / 573 tests
- Web 테스트: 14 suites / 245 tests

### 타입 검사 + 린트 + 빌드

```bash
npx tsc --noEmit && npx eslint . && npm run build
```

### E2E 테스트 (Docker)

```bash
npm run test:e2e
```

---

## 8. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        클라이언트                            │
│  관리자 대시보드 / 가맹점 포탈 / 대리점 포탈 / 결제 페이지    │
│                   (Next.js 15 + React)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (리버스 프록시)                    │
│              TLS 종단 / Rate Limiting / 정적 파일             │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌─────────┐    ┌───────────┐  ┌──────────┐
   │ Auth    │    │ PG Gateway│  │ Dashboard│
   │ Module  │    │ Module    │  │ Module   │
   │         │    │           │  │          │
   │ JWT+MFA │    │ 결제 처리  │  │ 통계/조회 │
   └────┬────┘    └─────┬─────┘  └────┬─────┘
        │               │             │
        └───────────┬───┘─────────────┘
                    ▼
   ┌────────────────────────────────────┐
   │         NestJS API Server          │
   │  Prisma ORM + OwnershipGuard      │
   │  FDS + AuditLog + Webhook         │
   └────────────────┬───────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────┐
   │        PostgreSQL 16               │
   │  35 테이블 / 트랜잭션 보장          │
   └────────────────┬───────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────┐
   │     Mock 카드사 (CardProcessor)     │
   │  → 실제 VAN/카드사로 교체 가능      │
   └────────────────────────────────────┘
```

### 웹 페이지 구성 (38페이지)

| 영역 | 경로 | 페이지 수 | 주요 기능 |
|------|------|-----------|-----------|
| 인증 | `/login`, `/login/mfa` | 2 | 로그인, MFA 인증 |
| 관리자 대시보드 | `/dashboard/*` | 17 | 전체 관리 (가맹점/대리점/거래/정산/보안/시스템) |
| 가맹점 포탈 | `/m/*` | 5 | 내 거래, 정산, 웹훅, 설정 |
| 대리점 포탈 | `/a/*` | 6 | 소속 가맹점, 거래, 정산, 수수료, 설정 |
| 결제 | `/checkout`, `/checkout-iframe` | 2 | 결제 페이지, iframe 임베드용 |
| 기타 | `/`, `/profile` | 2 | 랜딩, 프로필 |

---

## 9. 예상 질문 & 답변

### Q1: 실제 카드사 연동은 어떻게 되나요?
> 현재 Mock 카드사가 있는 자리에 실제 VAN(한국정보통신/KIS정보통신 등) API를 연결하면 됩니다. `AcquirerProvider` 인터페이스 기반 어댑터 패턴이므로, 구현체만 추가하면 기존 코드 변경 없이 전환됩니다.

### Q2: 토스페이먼츠/아임포트와 차이점은?
> 동일한 RESTful API 구조(결제키 기반)를 사용하면서 자체 운영이 가능합니다. PG 수수료 중간 마진 없이 직접 VAN 계약으로 비용을 절감하고, 정산 주기와 수수료를 자유롭게 설정할 수 있습니다.

### Q3: 보안 인증은 받았나요?
> PCI DSS 4.0 컴플라이언스에 맞춰 코드 레벨에서 구현 중이며, 서비스 런칭 전 QSA(Qualified Security Assessor)를 통한 공식 인증을 진행합니다. 현재 카드 토큰화, AES-256-GCM 암호화, 감사 해시 체인, FDS, CSP strict-dynamic 등 핵심 요구사항이 구현되어 있습니다.

### Q4: 정산은 어떻게 처리되나요?
> 정산 모듈이 완전 구현되어 있습니다. 건별/일괄 정산, 대리점 수수료 자동 계산, 정산 주기 관리가 가능합니다. 실제 은행 송금 연동은 VAN 계약 후 추가됩니다.

### Q5: 테스트 신뢰도는?
> 58개 테스트 스위트, 818개 테스트 케이스가 100% 통과합니다. 단위 테스트, 통합 테스트, Docker E2E 테스트 3단계로 검증되며, 보안 관련 테스트가 특히 강화되어 있습니다.

### Q6: 확장성은?
> NestJS 모듈 아키텍처 기반으로 결제 수단 추가(계좌이체, 가상계좌 등)가 독립적입니다. PostgreSQL 트랜잭션으로 데이터 무결성을 보장하며, 수평 확장 시 Redis 세션 스토어 추가로 대응합니다.

---

## 10. 트러블슈팅

### DB 연결 실패
```bash
# PostgreSQL 컨테이너 상태 확인
docker compose ps db

# 컨테이너 재시작
docker compose restart db

# 연결 테스트
docker compose exec db pg_isready
```

### 시드 데이터 없음 (로그인 실패)
```bash
cd apps/api && npx prisma db seed
```

### 포트 충돌
```bash
# 포트 사용 중인 프로세스 확인
lsof -i :4000  # API
lsof -i :3000  # Web
lsof -i :5432  # DB
```

### Checkout 페이지가 안 열릴 때
→ Section 6의 curl 명령어로 API 직접 테스트 가능

### API 서버 시작 실패
```bash
# 환경변수 확인
cd apps/api && cat .env

# 필수 환경변수:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pg_system
# JWT_SECRET=<any-string>
# ENCRYPTION_KEY=<32-byte-hex>
```

---

## 11. 실제 운영까지의 로드맵

### Phase A: 즉시 필요 (현재 → 2주)
- [ ] Next.js 15.2.3+ 업그레이드 (보안 취약점 패치)
- [ ] 테스트 커버리지 59% → 80% 달성
- [ ] 환경변수 검증 강화

### Phase B: 실결제 연동 (2~4주)
- [ ] VAN/카드사 어댑터 구현 (한국정보통신/KIS)
- [ ] 결제창 SDK/iframe 가맹점 임베드용 변환
- [ ] 실카드 테스트 환경 구축

### Phase C: 인프라/보안 (4~6주)
- [ ] QSA PCI DSS 인증 진행
- [ ] WAF(Web Application Firewall) 도입
- [ ] 모니터링 (Prometheus + Grafana)
- [ ] 부하 테스트 (k6)

### Phase D: 법적/규제 (6~8주)
- [ ] 금융감독원 전자금융업 등록
- [ ] 개인정보 영향평가
- [ ] 외부 보안 감사

### Phase E: 운영 (8주~)
- [ ] 24/7 모니터링 체계
- [ ] 장애 대응 매뉴얼
- [ ] 정기 보안 점검 체계

---

## 12. 데모 체크리스트 (시연 전 확인)

```
□ PostgreSQL 실행 중인가?
□ API 서버 (localhost:4000) 응답하는가?
□ Web 서버 (localhost:3500) 접속되는가?
□ 시드 데이터가 투입되었는가? (admin 로그인 성공 여부)
□ Swagger (localhost:4000/api/docs) 접속되는가?
□ Checkout 페이지에서 결제 테스트 성공하는가?
□ curl 명령어 백업 준비했는가? (UI 장애 대비)
```
