# PG System 데모 시나리오 (10~15분)

> Mock 카드사 기반 결제 → 승인 → 대시보드 확인 데모 워크스루

## 사전 준비

### 1. 환경 실행

```bash
# API 서버 (NestJS)
cd apps/api && npm run dev   # localhost:4000

# 웹 대시보드 (Next.js)
cd apps/web && npm run dev   # localhost:3500
```

### 2. 시드 데이터 생성

```bash
# 호스트에서 직접
cd apps/api && npx tsx prisma/seed.ts

# 또는 Docker compose 사용 시
docker exec -w /app/apps/api pg-system-api npx tsx prisma/seed.ts
```

> ⚠️ Prisma 6+에서는 `npx prisma db seed`가 `prisma.config.ts` 설정을 요구합니다. 위와 같이 `tsx prisma/seed.ts` 직접 실행이 가장 간단합니다.

시드 완료 시 콘솔에 출력되는 자격 증명:

| 항목 | 값 |
|------|-----|
| 관리자 로그인 ID | `admin` |
| 관리자 비밀번호 | `Admin1234!@` (env `SEED_ADMIN_PASSWORD` 미지정 시 기본값) |
| 가맹점 로그인 ID | `merchant_test` |
| 대리점 로그인 ID | `agent_test` |
| PG clientKey | `ck_test_demo_0000000000000000` |
| PG secretKey | `test_sk_demo_0000000000000000000000000000000000000000000000000000` |

> 💡 로그인 식별자는 **이메일이 아닌 `login_id`** 입니다 (DB users 테이블 기준).

### 3. 테스트 카드 정보

| 카드번호 | 결과 |
|----------|------|
| 아무 13-19자리 숫자 | 정상 승인 (금액 끝 2자리가 97/98/99가 아닌 경우) |

**Mock 카드사 실패 시뮬레이션** (금액 끝 2자리 기준):

| 금액 끝 2자리 | 결과 | 에러코드 |
|---------------|------|----------|
| 99 | 카드사 거절 | ACQ_001 |
| 98 | 타임아웃 | ACQ_002 |
| 97 | 잔액 부족 | ACQ_003 |
| 그 외 | 정상 승인 | - |

---

## 데모 흐름

### Step 1: 관리자 대시보드 로그인 (2분)

1. `http://localhost:3500/login` 접속
2. 관리자 계정으로 로그인
   - 로그인 ID: `admin`
   - 비밀번호: `Admin1234!@`
3. 대시보드 메인 화면 확인 (거래 현황, 통계)
4. 좌측 메뉴에서 가맹점/대리점/PG 관리 기능 소개

> **포인트**: "관리자가 가맹점, 대리점, 거래, 정산을 한 곳에서 관리합니다."

### Step 2: 결제 체크아웃 (3분)

1. 새 탭에서 `http://localhost:3001/checkout` 접속
2. 결제 폼 확인:
   - 주문번호: 자동 생성됨 (예: `ORDER-1709...`)
   - 주문명: `테스트 상품 결제`
   - 결제 금액: `10000` (1만원)
3. 카드 정보 입력:
   - 카드번호: `4111111111111111`
   - 유효기간: `12/28`
   - CVV: `123`
4. **"결제하기" 버튼 클릭**
5. 결제 성공 화면 확인 (paymentKey, 승인 시각, 금액)

> **포인트**: "가맹점 고객이 이 화면에서 카드 결제를 진행합니다. 프론트엔드에서 서버로 암호화 전송되고, Mock 카드사를 통해 즉시 승인됩니다."

### Step 3: 실패 케이스 시연 (2분)

1. "새 결제" 버튼으로 폼 복귀
2. 금액을 `10099`로 변경 (끝 2자리 99 = 카드사 거절)
3. 결제 시도 → 실패 화면 확인 (에러 코드, 메시지)

> **포인트**: "실제 카드사 거절 상황을 시뮬레이션합니다. 에러 코드 기반으로 가맹점이 원인을 파악할 수 있습니다."

### Step 4: 대시보드에서 거래 확인 (2분)

1. 관리자 대시보드 탭으로 전환
2. 거래 목록에서 방금 결제한 건 확인:
   - 성공 건: 상태 `APPROVED`
   - 실패 건: 상태 `FAILED`
3. 거래 상세 클릭 → 결제 키, 금액, 카드 정보(마스킹), 승인 시각 확인

> **포인트**: "결제 발생 즉시 관리자 대시보드에 반영됩니다. 거래 추적이 실시간으로 가능합니다."

### Step 5: Swagger API 문서 (2분)

1. `http://localhost:4000/api/docs` 접속
2. PG Gateway 섹션 확인:
   - POST `/pg/v1/payments` — 결제 주문 생성
   - POST `/pg/v1/payments/confirm` — 결제 승인
   - GET `/pg/v1/payments/:paymentKey` — 결제 조회
   - POST `/pg/v1/payments/:paymentKey/cancel` — 취소/환불
3. "Try it out"으로 API 직접 호출 시연 (선택)

> **포인트**: "가맹점 개발자가 이 문서를 보고 연동합니다. 토스페이먼츠 등 기존 PG사와 동일한 API 구조입니다."

### Step 6: 보안 기능 소개 (2분)

- **FDS (이상거래탐지)**: 금액 상한, IP 기반 탐지, 30분내 중복 차단
- **감사 로그**: 모든 결제/취소 건 감사 로그 자동 기록
- **API 키 관리**: 발급/폐기/IP 화이트리스트
- **웹훅**: 결제 상태 변경 시 가맹점에 자동 알림 (HMAC-SHA256 서명)

> **포인트**: "한국 금융감독원 기준 + PCI DSS 보안 요구사항을 코드 레벨에서 구현했습니다."

---

## 예상 질문 & 답변

### Q1: 실제 카드사 연동은 어떻게 되나요?
> 현재 Mock 카드사가 있는 자리에 실제 VAN(한국정보통신/KIS정보통신 등) API를 연결하면 됩니다. `CardProcessor` 인터페이스가 동일하므로 구현체만 교체합니다.

### Q2: 토스페이먼츠/아임포트와 차이점은?
> 동일한 API 구조(결제키 기반, RESTful)를 사용하면서, 자체 운영이 가능합니다. 수수료 중간 마진 없이 직접 VAN 계약으로 비용을 절감할 수 있습니다.

### Q3: 보안 인증은 받았나요?
> PCI DSS 4.0 컴플라이언스 맵에 따라 구현 중이며, 외부 보안 감사 체크리스트(`docs/external-audit-checklist.md`)를 준비했습니다. 실제 인증은 서비스 런칭 전 전문 기관을 통해 진행합니다.

### Q4: 정산은 어떻게 처리되나요?
> 정산 모듈이 구현되어 있습니다 (건별/일괄 정산, 대리점 수수료 계산). 현재는 정산 데이터 생성까지 완료되며, 실제 은행 송금 연동은 추후 진행합니다.

### Q5: 동시 처리 성능은?
> NestJS 비동기 아키텍처 기반이며, PostgreSQL 트랜잭션으로 데이터 무결성을 보장합니다. 부하 테스트는 서비스 런칭 전 수행 예정입니다.

---

## 장애 대응 (데모 중 문제 발생 시)

### Checkout 페이지가 안 열릴 때
→ Swagger API 직접 사용:
```bash
# 1. 결제 주문 생성
curl -X POST http://localhost:4000/pg/v1/payments \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"DEMO-001","amount":10000,"orderName":"테스트 상품","paymentMethod":"CARD"}'

# 2. 결제 승인
curl -X POST http://localhost:4000/pg/v1/payments/confirm \
  -H "Authorization: Basic $(echo -n 'test_sk_demo_0000000000000000000000000000000000000000000000000000:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"paymentKey":"<위 응답의 paymentKey>","orderId":"DEMO-001","amount":10000,"cardNumber":"4111111111111111","installmentMonths":0}'
```

### DB 연결 실패
→ PostgreSQL 실행 확인: `docker compose up -d postgres`

### 시드 데이터 없음
→ `cd apps/api && npx prisma db seed` 재실행

---

## 기술 스택 요약 (슬라이드용)

| 계층 | 기술 |
|------|------|
| Frontend | Next.js 15, React, shadcn/ui, Tailwind CSS |
| Backend | NestJS, Prisma ORM, PostgreSQL |
| 인증 | JWT (관리자) + Basic Auth (가맹점 API) |
| 보안 | FDS, HMAC-SHA256 웹훅, API 키 관리, 감사 로그 |
| 테스트 | Jest (517 tests), Vitest (10 tests), Docker E2E |
| 문서 | Swagger/OpenAPI 자동 생성 |
