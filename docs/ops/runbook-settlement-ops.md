# 정산 운영 매뉴얼 (Settlement Operations Runbook)

> **문서 버전**: 1.0
> **최종 수정**: 2026-03-01
> **작성 근거**: PCI DSS 4.0.1 / 전자금융감독규정 / 여신전문금융업법
> **대상**: 정산 운영자, 재무팀, 시스템 관리자

---

## 목차

1. [정산 체계 개요](#1-정산-체계-개요)
2. [일일 정산 프로세스](#2-일일-정산-프로세스)
3. [수수료 검증 체크리스트](#3-수수료-검증-체크리스트)
4. [불일치 조사 절차](#4-불일치-조사-절차)
5. [예외 처리 (환불/차백/분쟁)](#5-예외-처리-환불차백분쟁)
6. [DB 쿼리 모음](#6-정산-관련-db-쿼리-모음)
7. [월간/분기 보고서 생성 절차](#7-월간분기-보고서-생성-절차)
8. [정산 비상 상황 대응](#8-정산-비상-상황-대응)
9. [연락처 및 긴급 연락망](#9-연락처-및-긴급-연락망)
10. [정산 사고 Post-mortem 템플릿](#10-정산-사고-post-mortem-템플릿)
11. [부록: 용어 정리](#부록-용어-정리)

---

## 1. 정산 체계 개요

### 1.1 정산 주기

| 구분 | 주기 | 기준일 | 정산 대상 | 비고 |
|------|------|--------|-----------|------|
| 카드 결제 | T+2 (영업일) | 거래 승인일 | 가맹점별 순거래금액 | 주말/공휴일 이월 |
| 계좌이체 | T+1 (영업일) | 거래 승인일 | 가맹점별 순거래금액 | |
| 가상계좌 | T+1 (영업일) | 입금 확인일 | 가맹점별 입금 합산 | |

### 1.2 정산 상태 흐름

```
CALCULATED ──→ CONFIRMED ──→ REMITTED ──→ COMPLETED
   │               │             │             │
   │  정산 계산     │  재무팀      │  송금 완료   │  가맹점
   │  (시스템)      │  검토/승인   │  (은행 확인) │  입금 확인
   │               │             │             │
   └── 자동 ───────└── 수동 ─────└── 수동 ─────└── 자동/수동
```

### 1.3 수수료 계층 구조

```
PG 기본 마진율 (pg_default_margins)
  ≤ 대리점 수수료율 (agent_commissions)
    ≤ 가맹점 수수료율 (merchant_commissions)

예시: 카드(신한카드)
  PG 마진: 1.5%
  대리점 수수료: 2.0% (대리점 몫: 2.0 - 1.5 = 0.5%)
  가맹점 수수료: 2.5% (가맹점 부담, PG+대리점 배분)

위반 시: STL_003 에러 ("수수료 계층 검증 실패")
```

---

## 2. 일일 정산 프로세스

### 2.1 정산 실행 흐름

```
┌─────────────────────────────────────────────────────┐
│                  일일 정산 프로세스                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  09:00  PG사 입금 파일 수신 (deposits 테이블)         │
│    ↓                                                │
│  09:30  자동 대사 실행 (reconcile)                    │
│    ↓    ┌─ MATCHED: 정상 처리                        │
│         ├─ MISMATCHED: 불일치 알림 → 수동 조사        │
│         └─ MANUAL: 수동 매칭 대기                     │
│    ↓                                                │
│  10:00  정산 계산 실행 (calculate)                    │
│    ↓    가맹점별: total_amount, total_fee, total_net  │
│         대리점별: total_commission                    │
│    ↓                                                │
│  10:30  정산 검증 (재무팀 수동)                        │
│    ↓    체크리스트 확인 → 승인(confirm)                │
│    ↓                                                │
│  14:00  송금 처리 (complete)                          │
│    ↓    은행 연동 또는 수동 이체                       │
│    ↓                                                │
│  16:00  송금 확인 및 일일 보고서 생성                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 단계별 실행 방법

#### Step 1: 입금 데이터 등록

```bash
# API 호출: 입금 데이터 등록
POST /api/v1/deposits
Content-Type: application/json
Authorization: Bearer {accessToken}

{
  "source": "SHINHAN_PG",
  "deposit_date": "2026-03-01",
  "total_amount": 15000000,
  "detail": {
    "file_name": "SHINHAN_20260301.csv",
    "record_count": 342
  }
}
```

#### Step 2: 자동 대사 실행

```bash
# API 호출: 자동 대사
POST /api/v1/deposits/{depositId}/reconcile
Authorization: Bearer {accessToken}

# 응답 예시
{
  "success": true,
  "data": {
    "reconcile_status": "MATCHED",
    "matched_count": 340,
    "unmatched_amount": 50000
  }
}
```

**대사 로직 요약**:
1. 동일 deposit_date의 APPROVED 거래 중 미매칭 건 수집
2. 금액 순(내림차순) 탐욕 매칭
3. 완전 매칭 → MATCHED / 불일치 → unmatched_amount 기록

#### Step 3: 정산 계산

```bash
# API 호출: 정산 계산
POST /api/v1/settlements/calculate
Authorization: Bearer {accessToken}

{
  "settlementDate": "2026-03-01",
  "periodFrom": "2026-02-27",
  "periodTo": "2026-02-27"
}
```

**계산 로직**:
1. 기간 내 APPROVED 거래 수집
2. 가맹점별 그룹핑:
   - `total_amount` = 거래금액 합계
   - `total_fee` = 수수료 합계
   - `total_net` = total_amount - total_fee
   - `tran_count` = PAYMENT 거래 수
   - `cancel_count` = CANCEL 거래 수
3. 대리점별 집계:
   - `total_commission` = 소속 가맹점 수수료 합계
4. Prisma 트랜잭션으로 settlements + agent_settlements 동시 생성

#### Step 4: 정산 확정 (재무팀)

```bash
# API 호출: 정산 확정
POST /api/v1/settlements/{settlementId}/confirm
Authorization: Bearer {accessToken}
```

#### Step 5: 송금 완료 처리

```bash
# API 호출: 정산 완료
POST /api/v1/settlements/{settlementId}/complete
Authorization: Bearer {accessToken}

# remitted_at 자동 기록
```

---

## 3. 수수료 정산 검증 체크리스트

### 3.1 일일 검증 (매 정산 시)

| # | 검증 항목 | 확인 방법 | 합격 기준 |
|---|----------|----------|----------|
| 1 | 거래 건수 일치 | PG사 입금 파일 건수 vs 시스템 거래 건수 | 차이 0건 |
| 2 | 거래 금액 일치 | PG사 입금 총액 vs 시스템 총 거래금액 | 차이 0원 |
| 3 | 수수료 계산 정확성 | 임의 5건 샘플링 → 수동 계산 비교 | 오차 0원 |
| 4 | 수수료 계층 준수 | PG마진 ≤ 대리점 ≤ 가맹점 확인 | 위반 0건 |
| 5 | 환불/취소 반영 | CANCELLED 거래 정산 제외 확인 | 누락 0건 |
| 6 | 대사 상태 확인 | MISMATCHED/MANUAL 건 조사 완료 | 미해결 0건 |
| 7 | 중복 정산 검증 | 동일 settlement_date 중복 여부 | 중복 0건 |

### 3.2 월간 검증 (매월 초)

| # | 검증 항목 | 주기 | 담당 |
|---|----------|------|------|
| 1 | 월간 정산 총괄표 생성 | 매월 1일 | 재무팀 |
| 2 | 수수료율 변경 이력 검토 | 매월 1일 | 재무팀 |
| 3 | 미확정/미송금 정산 현황 | 매월 1일 | 운영팀 |
| 4 | 가맹점별 정산 명세서 발송 | 매월 5일 | 재무팀 |
| 5 | 대리점별 수수료 정산 | 매월 10일 | 재무팀 |

### 3.3 샘플 수수료 검증 계산

```
예시: 신한카드 결제 100,000원

가맹점 수수료율: 2.5%
  → fee_amount = 100,000 × 0.025 = 2,500원
  → net_amount = 100,000 - 2,500 = 97,500원

대리점 수수료율: 2.0%
  → agent_commission = 100,000 × 0.020 = 2,000원

PG 마진율: 1.5%
  → pg_margin = 100,000 × 0.015 = 1,500원

배분:
  가맹점 수령: 97,500원
  대리점 수수료: 2,000 - 1,500 = 500원
  PG사 마진: 1,500원
  합계: 97,500 + 500 + 1,500 = 99,500원 + VAT(부가세별도)
```

---

## 4. 정산 불일치 조사 절차

### 4.1 불일치 유형별 대응

```
불일치 발견
  ├─ ① 금액 차이 (Amount Mismatch)
  │    ├─ 소액 (1,000원 이하): 수동 보정 → 다음 정산 반영
  │    └─ 대액 (1,000원 초과): 조사 → 원인 파악 → 승인 후 보정
  │
  ├─ ② 건수 차이 (Count Mismatch)
  │    ├─ 시스템 > PG사: 미접수 거래 확인 → PG사 확인 요청
  │    └─ PG사 > 시스템: 누락 거래 확인 → 수동 등록 또는 반려
  │
  ├─ ③ 대사 미매칭 (Reconciliation Failure)
  │    ├─ 거래 정보 불일치: 거래번호/금액/일자 재확인
  │    └─ 시간대 차이: 전일/익일 거래 교차 확인
  │
  └─ ④ 수수료 오류 (Fee Calculation Error)
       ├─ 수수료율 미적용: commission 테이블 effective_to 확인
       └─ 계층 위반: PG→대리점→가맹점 순서 재검증
```

### 4.2 조사 절차 상세

```
1. 불일치 발견
   └─ 알림 수신 또는 체크리스트에서 발견

2. 원인 분류
   └─ 금액/건수/대사/수수료 중 해당 유형 확인

3. 데이터 수집
   └─ 관련 거래 내역, PG사 원본 파일, 시스템 로그 비교

4. 원인 분석
   └─ 아래 진단 쿼리 활용

5. 보정 방안 수립
   ├─ 소액 단순 오류: 운영자 보정
   └─ 대액/복잡 오류: 재무팀장 승인 필요

6. 보정 실행
   └─ 수동 매칭(manual-match) 또는 다음 정산 반영

7. 기록
   └─ 불일치 원인, 보정 내역, 승인자를 감사 로그에 기록

8. 재발 방지
   └─ 반복 패턴 발견 시 시스템 개선 요청
```

---

## 5. 예외 처리 (환불/차백/분쟁)

### 5.1 환불 (Refund) 처리

```
┌──────────────────────────────────────┐
│          환불 처리 흐름               │
├──────────────────────────────────────┤
│                                      │
│  가맹점 환불 요청                     │
│    ↓                                 │
│  원거래 확인 (status=APPROVED 검증)   │
│    ↓                                 │
│  POST /api/v1/transactions/{id}/cancel│
│    ↓                                 │
│  거래 상태 → CANCELLED               │
│  cancelled_at 기록                   │
│  payment_detail에 cancelReason 추가  │
│    ↓                                 │
│  다음 정산 시 cancel_count에 반영     │
│  (CANCELLED 거래는 정산에서 제외)     │
│                                      │
└──────────────────────────────────────┘
```

**주의사항**:
- 이미 CANCELLED 상태인 거래 재취소 시 → TXN_003 에러
- 환불 금액 = 원거래 금액 전액 (부분 환불은 별도 PARTIAL_CANCEL 타입)
- 정산 CONFIRMED 이후 환불 발생 시 → 다음 정산에서 차감 처리

### 5.2 차백 (Chargeback) 처리

```
차백 = 카드사가 강제로 거래를 취소하는 것 (카드 소유자 이의제기)

처리 절차:
1. PG사/카드사로부터 차백 통보 수신
2. 해당 거래 확인 및 상태 기록
   └─ 거래 취소 처리 (cancel 호출)
   └─ payment_detail에 chargeback 사유 기록
3. 가맹점에 차백 통보
   └─ 자료 제출 요청 (반증 자료)
4. 반증 기한 내 가맹점 자료 제출
   ├─ 반증 성공: 차백 철회 → 거래 복원 (새 APPROVED 거래 생성)
   └─ 반증 실패: 차백 확정 → 다음 정산에서 차감
5. 차백 수수료 (통상 건당 10,000~30,000원)
   └─ 가맹점 정산에서 추가 차감
```

**차백 사유별 대응**:

| 사유 코드 | 설명 | 반증 성공률 | 필요 자료 |
|-----------|------|-----------|----------|
| 4837 | 부정 사용 | 낮음 (20%) | 3D Secure 인증 기록 |
| 4853 | 미수령/불일치 | 중간 (50%) | 배송 증빙, 서명 |
| 4860 | 미승인 거래 | 높음 (70%) | 카드사 승인번호, 로그 |
| 4863 | 중복 결제 | 높음 (80%) | 별개 주문 증빙 |

### 5.3 분쟁 (Dispute) 처리

```
분쟁 처리 흐름:

1. 분쟁 접수
   └─ 고객/가맹점/카드사 중 하나가 제기

2. 분쟁 유형 분류
   ├─ 금액 오류: 결제 금액 ≠ 주문 금액
   ├─ 이중 결제: 동일 주문에 복수 결제
   ├─ 미배송/미제공: 서비스/상품 미수령
   └─ 품질 불만: 상품/서비스 하자

3. 조사 기간
   └─ 접수 후 영업일 기준 5일 이내 초동 조사
   └─ 최대 30일 이내 결론

4. 처리 결정
   ├─ 가맹점 과실: 환불 처리 + 해당 정산 반영
   ├─ PG사 과실: PG사 비용으로 보전
   └─ 고객 오인: 거래 유지 (안내 발송)

5. 정산 반영
   └─ 확정 후 다음 정산에서 증감 처리
```

---

## 6. 정산 관련 DB 쿼리 모음 (읽기 전용)

> **주의**: 모든 쿼리는 읽기 전용(SELECT)입니다. 직접 UPDATE/DELETE는 금지합니다.
> DB 변경은 반드시 API를 통해 수행하세요.

### 6.1 일일 정산 현황 조회

```sql
-- 특정 일자 정산 현황
SELECT
  s.id,
  s.settlement_date,
  s.status,
  m.business_name AS merchant_name,
  s.total_amount,
  s.total_fee,
  s.total_net,
  s.tran_count,
  s.cancel_count,
  s.payout_amount,
  s.confirmed_at,
  s.remitted_at
FROM settlements s
JOIN merchants m ON s.merchant_id = m.id
WHERE s.settlement_date = '2026-03-01'
ORDER BY s.total_amount DESC;
```

### 6.2 미확정/미송금 정산 조회

```sql
-- 미확정 정산 목록
SELECT
  s.id,
  s.settlement_date,
  m.business_name,
  s.total_amount,
  s.payout_amount,
  s.created_at
FROM settlements s
JOIN merchants m ON s.merchant_id = m.id
WHERE s.status = 'CALCULATED'
ORDER BY s.settlement_date ASC;

-- 확정됐지만 미송금 정산 목록
SELECT
  s.id,
  s.settlement_date,
  m.business_name,
  s.payout_amount,
  s.confirmed_at
FROM settlements s
JOIN merchants m ON s.merchant_id = m.id
WHERE s.status = 'CONFIRMED'
ORDER BY s.confirmed_at ASC;
```

### 6.3 가맹점별 정산 집계

```sql
-- 월간 가맹점별 정산 집계
SELECT
  m.business_name,
  m.merchant_code,
  COUNT(s.id) AS settlement_count,
  SUM(s.total_amount) AS total_amount,
  SUM(s.total_fee) AS total_fee,
  SUM(s.total_net) AS total_net,
  SUM(s.tran_count) AS total_tran_count,
  SUM(s.cancel_count) AS total_cancel_count
FROM settlements s
JOIN merchants m ON s.merchant_id = m.id
WHERE s.settlement_date >= '2026-03-01'
  AND s.settlement_date < '2026-04-01'
GROUP BY m.id, m.business_name, m.merchant_code
ORDER BY total_amount DESC;
```

### 6.4 대리점별 수수료 집계

```sql
-- 월간 대리점별 수수료 집계
SELECT
  a.agent_name,
  a.agent_code,
  COUNT(ags.id) AS settlement_count,
  SUM(ags.total_commission) AS total_commission,
  SUM(ags.tran_count) AS total_tran_count
FROM agent_settlements ags
JOIN agents a ON ags.agent_id = a.id
WHERE ags.settlement_date >= '2026-03-01'
  AND ags.settlement_date < '2026-04-01'
GROUP BY a.id, a.agent_name, a.agent_code
ORDER BY total_commission DESC;
```

### 6.5 수수료율 현재 적용 현황

```sql
-- 가맹점별 현재 적용 수수료율
SELECT
  m.business_name,
  mc.payment_method,
  mc.card_company,
  mc.commission_rate,
  mc.effective_from
FROM merchant_commissions mc
JOIN merchants m ON mc.merchant_id = m.id
WHERE mc.effective_to IS NULL  -- 현재 활성화
ORDER BY m.business_name, mc.payment_method;

-- 대리점별 현재 적용 수수료율
SELECT
  a.agent_name,
  ac.payment_method,
  ac.card_company,
  ac.commission_rate,
  ac.effective_from
FROM agent_commissions ac
JOIN agents a ON ac.agent_id = a.id
WHERE ac.effective_to IS NULL
ORDER BY a.agent_name, ac.payment_method;

-- PG 기본 마진율
SELECT
  payment_method,
  card_company,
  margin_rate,
  effective_from
FROM pg_default_margins
WHERE effective_to IS NULL
ORDER BY payment_method, card_company;
```

### 6.6 수수료 계층 위반 점검

```sql
-- 수수료 계층 위반 가맹점 탐지
-- PG마진 ≤ 대리점수수료 ≤ 가맹점수수료 위반 여부
SELECT
  m.business_name AS merchant,
  a.agent_name AS agent,
  mc.payment_method,
  mc.card_company,
  pgm.margin_rate AS pg_rate,
  ac.commission_rate AS agent_rate,
  mc.commission_rate AS merchant_rate,
  CASE
    WHEN ac.commission_rate::numeric < pgm.margin_rate::numeric THEN 'VIOLATION: agent < pg'
    WHEN mc.commission_rate::numeric < ac.commission_rate::numeric THEN 'VIOLATION: merchant < agent'
    ELSE 'OK'
  END AS validation
FROM merchant_commissions mc
JOIN merchants m ON mc.merchant_id = m.id
LEFT JOIN agents a ON m.agent_id = a.id
LEFT JOIN agent_commissions ac
  ON ac.agent_id = a.id
  AND ac.payment_method = mc.payment_method
  AND COALESCE(ac.card_company, '') = COALESCE(mc.card_company, '')
  AND ac.effective_to IS NULL
LEFT JOIN pg_default_margins pgm
  ON pgm.payment_method = mc.payment_method
  AND COALESCE(pgm.card_company, '') = COALESCE(mc.card_company, '')
  AND pgm.effective_to IS NULL
WHERE mc.effective_to IS NULL
HAVING CASE
    WHEN ac.commission_rate::numeric < pgm.margin_rate::numeric THEN 'VIOLATION: agent < pg'
    WHEN mc.commission_rate::numeric < ac.commission_rate::numeric THEN 'VIOLATION: merchant < agent'
    ELSE 'OK'
  END != 'OK';
```

### 6.7 대사 현황 조회

```sql
-- 일일 대사 현황
SELECT
  d.id,
  d.source,
  d.deposit_date,
  d.total_amount,
  d.reconcile_status,
  d.unmatched_amount,
  COUNT(dt.id) AS matched_tran_count
FROM deposits d
LEFT JOIN deposit_transactions dt ON d.id = dt.deposit_id
WHERE d.deposit_date = '2026-03-01'
GROUP BY d.id
ORDER BY d.total_amount DESC;

-- 미대사 건 목록
SELECT
  d.id,
  d.source,
  d.deposit_date,
  d.total_amount,
  d.unmatched_amount
FROM deposits d
WHERE d.reconcile_status IN ('PENDING', 'MISMATCHED')
ORDER BY d.deposit_date ASC;
```

### 6.8 거래 취소/환불 현황

```sql
-- 기간 내 취소/환불 거래 현황
SELECT
  t.id,
  t.tran_no,
  m.business_name,
  t.tran_type,
  t.amount,
  t.payment_method,
  t.cancelled_at,
  t.payment_detail->>'cancelReason' AS cancel_reason
FROM transactions t
JOIN merchants m ON t.merchant_id = m.id
WHERE t.status = 'CANCELLED'
  AND t.cancelled_at >= '2026-03-01'
  AND t.cancelled_at < '2026-04-01'
ORDER BY t.cancelled_at DESC;
```

---

## 7. 월간/분기 보고서 생성 절차

### 7.1 월간 정산 보고서

**생성 주기**: 매월 1~3 영업일
**담당**: 재무팀

**포함 항목**:

| 섹션 | 내용 | 데이터 소스 |
|------|------|-----------|
| 1. 요약 | 총 거래건수, 총 거래금액, 총 수수료, 총 순정산액 | 쿼리 6.3 |
| 2. 가맹점별 | 가맹점별 거래/수수료/순정산 상세 | 쿼리 6.3 |
| 3. 대리점별 | 대리점별 수수료 수익 | 쿼리 6.4 |
| 4. 결제수단별 | 카드/계좌이체/가상계좌별 비중 | 별도 집계 |
| 5. 환불/취소 | 환불 건수, 차백 건수, 분쟁 현황 | 쿼리 6.8 |
| 6. 미처리 현황 | 미확정/미송금/미대사 건 | 쿼리 6.2, 6.7 |

**생성 절차**:

```
1. 전월 정산 데이터 집계 (쿼리 6.3 ~ 6.8)
2. 이전 월 대비 증감률 계산
3. 이상치(평균 대비 ±30%) 표시
4. 보고서 초안 작성 → 재무팀장 검토
5. 최종본 경영진 보고
6. 가맹점별 명세서 발송 (매월 5일)
```

### 7.2 분기 보고서

**생성 주기**: 분기 종료 후 10 영업일
**담당**: 재무팀 + 운영팀

**추가 포함 항목** (월간 보고서에 더하여):

| 섹션 | 내용 |
|------|------|
| 수수료율 변경 이력 | 분기 내 모든 수수료율 변경 건 |
| 가맹점 증감 현황 | 신규/해지 가맹점 목록 |
| 대사 정확도 | 자동 대사 성공률 트렌드 |
| 차백 분석 | 차백률, 주요 사유, 가맹점별 차백 빈도 |
| 시스템 안정성 | 정산 관련 장애/지연 건 |

---

## 8. 정산 비상 상황 대응

### 8.1 정산 지연 시

```
정산 지연 발생
  │
  ├─ 원인 1: 시스템 장애
  │    └─ 장애 대응 매뉴얼 참조 (runbook-incident-response.md)
  │    └─ 복구 후 정산 재실행
  │
  ├─ 원인 2: PG사 입금 파일 미수신
  │    └─ PG사 담당자 연락 (1시간 내)
  │    └─ 수동 입금 파일 요청
  │    └─ 수신 후 정상 프로세스 진행
  │
  ├─ 원인 3: 대사 대량 불일치
  │    └─ 불일치 원인 분석 (쿼리 6.7)
  │    └─ PG사 데이터와 교차 검증
  │    └─ 수동 매칭으로 긴급 처리
  │
  └─ 원인 4: 송금 시스템 장애
       └─ 은행 담당자 연락
       └─ 대체 송금 수단 확보
       └─ 가맹점에 지연 안내 발송
```

### 8.2 PG사 API 장애 시

```
PG사 API 응답 불가 / 타임아웃 발생
  │
  ├─ 1. 즉각 확인
  │    ├─ PG사 상태 페이지 확인 (status page URL)
  │    ├─ API 헬스체크 엔드포인트 수동 호출
  │    └─ 최근 5분 에러율 확인 (모니터링 대시보드)
  │
  ├─ 2. 영향 범위 파악
  │    ├─ 영향받는 결제수단 확인 (카드/계좌/가상계좌)
  │    ├─ 미처리 거래 건수 집계
  │    └─ 대기 중인 정산 건 확인 (쿼리 6.2)
  │
  ├─ 3. 긴급 대응
  │    ├─ PG사 기술지원팀 연락 (30분 이내)
  │    ├─ 가맹점 결제 페이지에 안내 메시지 노출
  │    └─ 대체 PG 라우팅 활성화 (구축된 경우)
  │
  ├─ 4. 복구 후 조치
  │    ├─ 미처리 거래 재처리 (배치)
  │    ├─ 정산 일정 재산정 (T+N 기산일 조정)
  │    └─ 가맹점 정산 지연 안내 발송
  │
  └─ 5. 기록
       └─ Post-mortem 작성 (섹션 10 템플릿 활용)
```

### 8.3 은행 송금 실패 시

```
정산 송금 API 실패 / 일부 건 미입금
  │
  ├─ 1. 실패 유형 확인
  │    ├─ 전면 장애: 은행 시스템 점검/장애
  │    ├─ 부분 실패: 특정 계좌 오류 (계좌번호/예금주 불일치)
  │    └─ 한도 초과: 건당/일일 송금 한도 도달
  │
  ├─ 2. 전면 장애 대응
  │    ├─ 은행 담당자 연락 → 복구 예상 시간 확인
  │    ├─ 대체 은행 송금 경로 확인
  │    ├─ 가맹점 지연 안내 (이메일/SMS)
  │    └─ 복구 후 실패 건 일괄 재전송
  │
  ├─ 3. 부분 실패 대응
  │    ├─ 실패 사유 코드 확인
  │    ├─ 가맹점 계좌 정보 재확인 요청
  │    ├─ 수정 후 개별 재송금
  │    └─ 3회 연속 실패 시 수동 처리 전환
  │
  ├─ 4. 한도 초과 대응
  │    ├─ 잔여 한도 확인
  │    ├─ 우선순위 기준 분할 송금 (금액 큰 순 / 지연일수 큰 순)
  │    └─ 다음 영업일 잔여분 송금
  │
  └─ 5. 기록
       ├─ 실패 건 전체 목록 CSV 저장
       └─ Post-mortem 작성 (섹션 10 템플릿 활용)
```

### 8.4 대사 대량 불일치 시

```
대사(Reconciliation) 불일치율 5% 초과 발생
  │
  ├─ 1. 긴급 판단 기준
  │    ├─ 불일치율 5~10%: 주의 단계 → 원인 분석 시작
  │    ├─ 불일치율 10~30%: 경고 단계 → 정산 일시 중지 검토
  │    └─ 불일치율 30% 초과: 위기 단계 → 정산 중지 + 재무팀장 즉시 보고
  │
  ├─ 2. 원인 분석
  │    ├─ PG사 입금 파일 포맷 변경 여부 확인
  │    ├─ 시스템 거래 데이터 정합성 확인 (쿼리 6.7)
  │    ├─ 날짜 기준 불일치 (T+N 기산일 차이)
  │    ├─ 중복 거래 / 누락 거래 식별
  │    └─ 수수료율 변경 반영 시점 차이
  │
  ├─ 3. 긴급 처리
  │    ├─ PG사 담당자와 데이터 교차 검증
  │    ├─ 일치 확인된 건만 우선 정산 진행
  │    ├─ 불일치 건 별도 보류 처리
  │    └─ 수동 매칭 (거래번호 기준 1건씩)
  │
  ├─ 4. 근본 원인 해결
  │    ├─ 포맷 변경: 파서 업데이트
  │    ├─ 기산일 차이: 매핑 로직 수정
  │    └─ 시스템 버그: 핫픽스 배포
  │
  └─ 5. 기록
       ├─ 불일치 건 상세 내역 보존 (90일)
       └─ Post-mortem 작성 (섹션 10 템플릿 활용)
```

### 8.5 정산 오류 발견 시

```
이미 송금된 정산에서 오류 발견 시:

1. 즉시 재무팀장에게 보고
2. 오류 범위 확인 (단일 가맹점 vs 전체)
3. 오류 유형 판단:
   ├─ 과다 송금: 다음 정산에서 차감 또는 환수 요청
   └─ 과소 송금: 추가 송금 처리
4. 관련 증빙 확보 (스크린샷, 쿼리 결과)
5. 보정 처리 후 감사 로그에 기록
6. 재발 방지 대책 수립
```

---

## 9. 연락처 및 긴급 연락망

| 역할 | 담당 | 연락처 | 비고 |
|------|------|--------|------|
| 정산 운영 담당 | (미지정) | - | 일일 정산 실행 |
| 재무팀장 | (미지정) | - | 정산 승인 권한 |
| PG사 정산 담당 | (계약 후 기입) | - | 입금 파일 관련 |
| 은행 담당자 | (계약 후 기입) | - | 송금 관련 |
| 시스템 관리자 | (미지정) | - | 장애 대응 |

---

## 10. 정산 사고 Post-mortem 템플릿

> 정산 지연 4시간 초과, 오정산 발생, 대사 불일치 30% 초과 시 **3 영업일 이내** 작성 필수

```markdown
# 정산 사고 Post-mortem 보고서

## 기본 정보

| 항목 | 내용 |
|------|------|
| 보고서 ID | STL-PM-YYYY-NNN |
| 사고 유형 | 정산지연 / 오정산 / 대사불일치 / PG API장애 / 송금실패 |
| 사고 등급 | P0(전면중단) / P1(부분장애) / P2(일부지연) |
| 발생 일시 | YYYY-MM-DD HH:MM |
| 감지 일시 | YYYY-MM-DD HH:MM (소요시간: _분) |
| 해결 일시 | YYYY-MM-DD HH:MM (총 소요시간: _시간 _분) |
| 작성자 | (정산 운영 담당자명) |
| 검토자 | (재무팀장) |

## 영향 범위

| 항목 | 상세 |
|------|------|
| 영향받은 가맹점 수 | _개 |
| 영향받은 거래 건수 | _건 |
| 영향받은 금액 | _원 |
| 정산 지연 시간 | _시간 _분 |
| 오정산 금액 (과다/과소) | _원 (과다 __ / 과소 __) |
| 보정 처리 완료 여부 | 완료 / 미완료 (예정일: __) |

## 타임라인

| 시각 | 이벤트 | 조치자 |
|------|--------|--------|
| HH:MM | (최초 이상 감지 — 모니터링 알림/수동 발견) | - |
| HH:MM | (원인 파악 시작) | - |
| HH:MM | (긴급 대응 — 정산 중지/수동 전환/PG사 연락) | - |
| HH:MM | (원인 해결 — 시스템 복구/데이터 보정) | - |
| HH:MM | (정산 재실행 — 정상 처리 확인) | - |
| HH:MM | (사고 종료 — 가맹점 안내 발송) | - |

## 근본 원인 분석

### 직접 원인
(정산 장애를 직접 야기한 원인 — 예: PG사 API 타임아웃, 입금 파일 포맷 변경 등)

### 근본 원인
(직접 원인이 발생하게 된 구조적 원인 — 예: 파서 버전 미업데이트, 모니터링 부재 등)

### 재무적 영향
- 과다 송금 건수 및 금액: (환수 여부, 방법)
- 과소 송금 건수 및 금액: (추가 송금 일시)
- 수수료 오차 건수 및 금액: (보정 방법)

## 대응 평가

### 잘된 점 (What Went Well)
- (신속하게 감지/대응한 부분)
- (가맹점 커뮤니케이션이 적절했던 부분)

### 개선 필요 (What Needs Improvement)
- (감지 지연 원인)
- (대응 프로세스 누락/미흡 사항)
- (가맹점 안내 타이밍/내용 개선 사항)

### 데이터 검증 결과
- 보정 전후 정산 합계 일치 여부: Y/N
- 수수료 재계산 검증 완료 여부: Y/N
- 가맹점별 정산 명세서 재발송 여부: Y/N

## 재발 방지 조치

| # | 조치 항목 | 우선순위 | 담당 | 기한 | 상태 |
|---|----------|---------|------|------|------|
| 1 | (기술적 조치 — 파서 수정/검증 로직 추가) | P0 | - | - | 미착수 |
| 2 | (모니터링 — 대사 불일치율 알림 임계값 설정) | P1 | - | - | 미착수 |
| 3 | (프로세스 — PG사 파일 포맷 변경 사전 통보 절차) | P1 | - | - | 미착수 |
| 4 | (검증 — 정산 실행 전 자동 샘플 검증 도입) | P2 | - | - | 미착수 |

## 서명

| 역할 | 성명 | 서명일 |
|------|------|--------|
| 작성자 (정산 담당) | - | - |
| 재무팀장 | - | - |
| CTO | - | - |
```

---

## 부록: 용어 정리

| 용어 | 설명 |
|------|------|
| T+N | 거래일(T) 기준 N 영업일 후 |
| 대사 (Reconciliation) | PG사 입금 데이터와 시스템 거래 데이터 일치 확인 |
| 차백 (Chargeback) | 카드 소유자 이의제기로 카드사가 강제 거래 취소 |
| 수수료 계층 | PG마진 ≤ 대리점수수료 ≤ 가맹점수수료 순서 |
| 순정산액 (Net Settlement) | 거래금액 - 수수료 = 가맹점 수령액 |
| 베이스 마진 (PG Margin) | PG사가 기본으로 가져가는 수수료율 |
