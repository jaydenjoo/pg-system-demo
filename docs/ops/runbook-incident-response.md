# 장애 대응 매뉴얼 (Incident Response Runbook)

> **문서 버전**: 1.0
> **최종 수정**: 2026-03-01
> **대상 독자**: 운영팀, 개발팀, CTO
> **관련 규정**: PCI DSS 12.10.1, 전자금융감독규정 제32조

---

## 목차

1. [장애 등급 분류 (Severity Classification)](#1-장애-등급-분류)
2. [응답/해결 SLA](#2-응답해결-sla)
3. [에스컬레이션 매트릭스](#3-에스컬레이션-매트릭스)
4. [장애 대응 기본 절차](#4-장애-대응-기본-절차)
5. [장애 유형별 대응 플로우](#5-장애-유형별-대응-플로우)
   - 5.1 DB 커넥션 풀 고갈
   - 5.2 API 서버 다운
   - 5.3 결제 처리 지연/실패
   - 5.4 디스크/메모리 부족
   - 5.5 DDoS 공격 감지
   - 5.6 TLS 인증서 만료
   - 5.7 감사 로그 해시 체인 끊김
6. [사후분석 (Post-mortem) 템플릿](#6-사후분석-post-mortem-템플릿)
7. [커뮤니케이션 템플릿](#7-커뮤니케이션-템플릿)
8. [비상 연락망](#8-비상-연락망)
9. [부록: 진단 명령어 모음](#9-부록-진단-명령어-모음)

---

## 1. 장애 등급 분류

| 등급 | 이름 | 정의 | 예시 |
|------|------|------|------|
| **P0** | 전면 장애 (Critical) | 시스템 전체가 사용 불가. 결제 처리 완전 중단 | DB 서버 다운, Nginx 전면 장애, 데이터 유출 사고 |
| **P1** | 핵심 기능 장애 (Major) | 결제/정산 등 핵심 기능 장애. 일부 사용자 또는 가맹점 영향 | 결제 API 타임아웃, 정산 배치 실패, MFA 서비스 장애 |
| **P2** | 부분 장애 (Minor) | 보조 기능 장애. 핵심 결제는 정상 | 관리자 대시보드 느림, 보고서 생성 실패, 알림 발송 지연 |
| **P3** | 경미한 이슈 (Low) | 사용성 불편. 비즈니스 영향 미미 | UI 깨짐, 비핵심 API 간헐적 에러, 로그 포맷 이상 |

### 등급 판단 기준

```
결제/정산이 완전히 멈췄는가?
├── YES → P0
└── NO
    ├── 결제/정산 일부에 영향이 있는가?
    │   ├── YES → P1
    │   └── NO
    │       ├── 사용자에게 보이는 오류가 있는가?
    │       │   ├── YES → P2
    │       │   └── NO → P3
```

> **PCI DSS 12.10.1**: 보안 사고 발생 시 즉각 대응할 수 있는 사고 대응 계획을 수립하고 유지해야 한다.

---

## 2. 응답/해결 SLA

| 등급 | 최초 응답 | 상황 업데이트 주기 | 목표 해결 시간 | 사후분석 제출 |
|------|-----------|-------------------|---------------|-------------|
| **P0** | **15분 이내** | 매 30분 | 2시간 | 24시간 이내 |
| **P1** | **30분 이내** | 매 1시간 | 4시간 | 48시간 이내 |
| **P2** | **2시간 이내** | 매 4시간 | 1영업일 | 1주일 이내 |
| **P3** | **1영업일 이내** | 해결 시 1회 | 1주일 | 불필요 |

### 근무 시간 외 (야간/주말) 대응

- **P0**: 24/7 즉시 대응 — 당직자(On-Call) 호출
- **P1**: 당직자 판단 → 즉시 대응 또는 익일 업무 시작 시
- **P2, P3**: 익일 업무 시간에 처리

---

## 3. 에스컬레이션 매트릭스

### 자동 에스컬레이션 조건

```
[장애 발생]
    │
    ▼
[담당 엔지니어] ← 최초 15분
    │
    ├── 30분 내 해결 안 됨 → [팀장/시니어 엔지니어]
    │
    ├── 1시간 내 해결 안 됨 → [CTO]
    │
    ├── 2시간 내 해결 안 됨 (P0만) → [경영진 + 법무팀]
    │
    └── 데이터 유출 의심 → [즉시 CTO + 법무팀 + 금융감독원 보고 준비]
```

### 에스컬레이션 테이블

| 단계 | 담당 | 조건 | 책임 |
|------|------|------|------|
| **L1** | 당직 엔지니어 | 장애 감지 즉시 | 초기 진단, 긴급 조치, 장애 등급 판정 |
| **L2** | 팀장 / 시니어 | L1 30분 초과 또는 P0/P1 | 기술적 의사결정, 추가 인력 투입 |
| **L3** | CTO | L2 1시간 초과 또는 데이터 유출 | 경영진 보고, 외부 커뮤니케이션 결정 |
| **L4** | 경영진 + 법무 | P0 2시간 초과 또는 개인정보 유출 | 고객 공지, 규제기관 신고 결정 |

> **전자금융감독규정 제32조**: 전자금융사고 발생 시 금융감독원장에게 지체 없이 보고해야 한다. 사고보고는 1차(즉시), 2차(원인분석 후), 최종(사후조치 완료 후)으로 구분한다.

---

## 4. 장애 대응 기본 절차

모든 장애에 공통 적용되는 5단계:

### Step 1: 감지 및 확인 (Detect & Confirm)

```bash
# 1-1. Health Check로 시스템 상태 확인
curl -s https://localhost/api/v1/health | jq .
curl -s https://localhost/api/v1/ready | jq .
curl -s https://localhost/api/v1/live | jq .

# 1-2. 모든 컨테이너 상태 확인
docker compose ps

# 1-3. 최근 로그 확인 (에러만)
docker compose logs --tail=100 api 2>&1 | grep -i "error\|fatal\|exception"
docker compose logs --tail=100 nginx 2>&1 | grep -i "error\|502\|503"
```

**판단**: 장애가 실제 발생했는지 확인 → 등급 판정 → 에스컬레이션 필요 여부 결정

### Step 2: 격리 (Isolate)

- 영향 범위를 최소화하기 위해 문제 서비스를 격리한다.
- **절대 운영 DB를 직접 수정하지 않는다.**
- 결제 중인 트랜잭션이 있을 수 있으므로 **즉시 kill 금지** — graceful 종료 우선

### Step 3: 긴급 조치 (Mitigate)

- 아래 [유형별 대응 절차](#5-장애-유형별-대응-플로우) 참조
- 조치 내용을 반드시 기록 (Slack 스레드 또는 사고 로그)

### Step 4: 복구 확인 (Verify Recovery)

```bash
# 4-1. 서비스 상태 재확인
curl -s https://localhost/api/v1/health | jq .

# 4-2. 결제 테스트 트랜잭션 (테스트 가맹점으로)
# 실제 명령은 테스트 환경에서 수행

# 4-3. 에러율 확인 (최근 5분)
docker compose logs --since=5m api 2>&1 | grep -c "ERROR"
```

### Step 5: 사후분석 (Post-mortem)

- P0/P1: 필수 작성 → [Post-mortem 템플릿](#6-사후분석-post-mortem-템플릿) 사용
- P2: 팀장 판단에 따라 작성
- P3: 불필요

---

## 5. 장애 유형별 대응 플로우

### 5.1 DB 커넥션 풀 고갈

**증상**: API 응답 시간 급증, `Connection pool exhausted` 에러, Health Check에서 DB 상태 `disconnected`

**원인**: 느린 쿼리 적체, 커넥션 반환 실패, 갑작스러운 트래픽 급증

**대응 절차**:

```
[1] 현황 파악
    │
    ▼
[2] 활성 커넥션 확인 ──→ 느린 쿼리 발견? ──→ [3a] 쿼리 강제 종료
    │                                          │
    │                                          ▼
    │                                    [4] 원인 쿼리 기록
    │
    └── 커넥션 정상 but 풀 부족 ──→ [3b] API 서버 재시작
                                          │
                                          ▼
                                    [5] 풀 사이즈 조정 검토
```

**명령어**:

```bash
# [1] DB 커넥션 수 확인
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT count(*) FROM pg_stat_activity;"

# [2] 활성 쿼리 확인 (30초 이상 실행 중인 것)
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
   AND state != 'idle'
   ORDER BY duration DESC;"

# [3a] 특정 쿼리 강제 종료 (pid 확인 후)
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT pg_terminate_backend(<PID>);"

# [3b] API 서버 graceful 재시작
docker compose restart api

# [5] Prisma 커넥션 풀 확인 (schema.prisma)
# connection_limit 값 확인 및 조정 필요 시 개발팀 전달
```

**주의**: `pg_terminate_backend`은 실행 중인 트랜잭션을 강제 종료한다. 결제 관련 쿼리인지 반드시 확인 후 종료할 것.

---

### 5.2 API 서버 다운

**증상**: `/api/v1/health` 응답 없음, Nginx에서 502 Bad Gateway 반환, 프론트엔드 연결 불가

**원인**: 메모리 부족(OOM Kill), 처리되지 않은 예외, 의존 서비스(DB) 장애

**대응 절차**:

```
[1] 컨테이너 상태 확인
    │
    ├── Exited (137) → OOM Kill → [2a] 메모리 제한 확인
    ├── Exited (1)   → 애플리케이션 에러 → [2b] 로그 확인
    └── Running but 무응답 → [2c] 프로세스 상태 확인
```

**명령어**:

```bash
# [1] 컨테이너 상태 확인
docker compose ps api

# OOM 여부 확인
docker inspect pg-system-api | grep -A 5 "OOMKilled"

# [2a] 메모리 사용량 확인
docker stats pg-system-api --no-stream

# [2b] 최근 에러 로그 확인
docker compose logs --tail=200 api 2>&1 | grep -i "error\|fatal\|unhandled"

# [2c] 컨테이너 내부 프로세스 확인
docker compose exec api ps aux

# [3] API 서버 재시작
docker compose restart api

# [4] 재시작 후 Health Check
sleep 10 && curl -s https://localhost/api/v1/health | jq .

# [5] DB 연결도 확인 (API가 DB 의존)
docker compose exec db pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
```

**추가 조치**:
- OOM Kill이 반복되면: `docker-compose.yml`에서 `deploy.resources.limits.memory` 상향 조정 (개발팀 검토 필요)
- 처리되지 않은 예외가 원인이면: 에러 로그에서 스택트레이스 캡처 → 개발팀에 버그 리포트

---

### 5.3 결제 처리 지연/실패

**증상**: 결제 API 응답 지연 (>5초), 결제 상태가 `PENDING`에서 변하지 않음, 가맹점/고객 민원 접수

**원인**: 외부 PG 연동 서버 장애, 내부 결제 로직 병목, 네트워크 이슈

> **PCI DSS 10.4.1**: 중요 보안 관련 이벤트에 대한 감사 추적을 구현한다.

**대응 절차**:

```
[1] 결제 API 응답 시간 확인
    │
    ├── 외부 PG 응답 지연 → [2a] 외부 PG 상태 페이지 확인
    │                         └── PG 장애 확인 → [3a] 대체 PG 전환 또는 결제 일시 중단
    │
    └── 내부 처리 지연 → [2b] API 로그에서 병목 지점 확인
                           └── DB 쿼리 느림 → 5.1 참조
                           └── 로직 에러 → 개발팀 긴급 패치
```

**명령어**:

```bash
# [1] 결제 관련 로그 확인
docker compose logs --tail=200 api 2>&1 | grep -i "payment\|transaction\|결제"

# [2a] 외부 PG 연동 상태 확인 (네트워크)
docker compose exec api curl -s -o /dev/null -w "%{http_code} %{time_total}s" \
  https://pg-gateway.example.com/health

# [2b] 최근 결제 트랜잭션 상태 확인 (DB 직접 조회 - 읽기 전용)
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT status, count(*), avg(EXTRACT(EPOCH FROM updated_at - created_at)) as avg_duration_sec
   FROM transactions
   WHERE created_at > now() - interval '1 hour'
   GROUP BY status
   ORDER BY count(*) DESC;"

# [3] PENDING 상태 건수 확인
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT count(*) as pending_count
   FROM transactions
   WHERE status = 'PENDING'
   AND created_at > now() - interval '1 hour';"
```

**주의사항**:
- 결제 트랜잭션 데이터를 직접 UPDATE하지 않는다 (무결성 보장)
- 외부 PG 장애 시 고객 안내 공지 발송 (커뮤니케이션 템플릿 참조)
- PENDING 건이 다량 적체된 경우: 복구 후 배치 재처리 필요 (개발팀 주도)

---

### 5.4 디스크/메모리 부족

**증상**: 컨테이너 재시작 반복, 로그 기록 실패, DB 쓰기 실패 (`No space left on device`)

**원인**: 로그 파일 과다 적재, 백업 파일 미삭제, Docker 이미지/볼륨 누적, 메모리 누수

**대응 절차**:

```
[1] 디스크 사용량 확인
    │
    ├── /var/lib/docker 가 90% 이상 → [2a] Docker 정리
    ├── /backups 가 90% 이상 → [2b] 오래된 백업 삭제
    └── 로그 파일 과다 → [2c] 로그 정리
```

**명령어**:

```bash
# [1] 호스트 디스크 사용량
df -h

# Docker 볼륨별 사용량
docker system df

# 컨테이너별 메모리/CPU
docker stats --no-stream

# [2a] Docker 미사용 리소스 정리 (안전한 정리)
docker system prune -f  # 중지된 컨테이너, 미사용 네트워크, dangling 이미지 제거

# [2b] 30일 초과 백업 수동 삭제 (확인 후)
ls -la /backups/daily/ | head -20
# 삭제 전 반드시 최신 백업 존재 확인!
find /backups/daily/ -mtime +30 -name "*.dump.enc" -exec rm {} \;

# [2c] Docker 로그 크기 확인 및 정리
docker compose logs api 2>&1 | wc -l
# 로그 로테이션이 설정되지 않은 경우:
truncate -s 0 $(docker inspect --format='{{.LogPath}}' pg-system-api)
```

**예방 조치**:
- Docker 로그 로테이션 설정 (`docker-compose.yml`에 `logging.options.max-size: "100m"`)
- 디스크 사용률 80% 알림 설정 (모니터링 대시보드)
- 백업 자동 삭제 스크립트 (30일 롤링) — Step 12-3에서 구현

---

### 5.5 DDoS 공격 감지

**증상**: 요청 수 비정상 급증, 응답 시간 급격히 증가, Rate Limiting 알림 대량 발생, 특정 IP에서 반복 요청

> **PCI DSS 6.4.1**: 웹 애플리케이션에 대한 공격 감지 및 방지

**대응 절차**:

```
[1] 트래픽 패턴 확인
    │
    ├── 단일/소수 IP → [2a] 해당 IP 차단 (Nginx)
    │
    ├── 분산 IP (Botnet) → [2b] Rate Limiting 강화 + CDN/WAF 활성화
    │
    └── 정상 트래픽 급증 (이벤트 등) → [2c] 서버 스케일링
```

**명령어**:

```bash
# [1] 최근 접속 IP 빈도 분석 (Nginx 로그)
docker compose exec nginx cat /var/log/nginx/access.log | \
  awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# 분당 요청 수 확인
docker compose exec nginx cat /var/log/nginx/access.log | \
  awk '{print $4}' | cut -d: -f2,3 | sort | uniq -c | tail -10

# [2a] 특정 IP 차단 (Nginx 설정에 추가)
# /etc/nginx/conf.d/blocked-ips.conf에 추가:
# deny 123.45.67.89;

# 차단 후 Nginx 재로드 (재시작 아님!)
docker compose exec nginx nginx -s reload

# [2b] Rate Limiting 현재 설정 확인 (NestJS ThrottleGuard)
docker compose logs api 2>&1 | grep -i "throttle\|rate.limit\|too.many"

# [3] 현재 동시 연결 수 확인
docker compose exec nginx sh -c \
  "cat /proc/net/tcp | wc -l"
```

**주의사항**:
- IP 차단은 임시 조치이며, 공격 종료 후 반드시 차단 목록 정리
- CDN/WAF 미구축 상태에서는 Nginx 수준 차단이 최선의 방어
- 공격 규모가 대형(대역폭 소진)이면: 호스팅 사업자/ISP 연락 필요

---

### 5.6 TLS 인증서 만료

**증상**: 브라우저에서 `NET::ERR_CERT_DATE_INVALID`, HTTPS 접속 불가, Health Check 실패

> **PCI DSS 4.2.1**: 강력한 암호화를 사용하여 개방형 공용 네트워크를 통한 PAN 전송을 보호한다.

**대응 절차**:

```bash
# [1] 인증서 만료일 확인
echo | openssl s_client -servername localhost -connect localhost:443 2>/dev/null | \
  openssl x509 -noout -dates

# [2] 인증서 갱신 (Let's Encrypt 사용 시)
# certbot renew --nginx
# 또는 수동 갱신:
# 1. 새 인증서 파일 준비 (cert.pem, key.pem)
# 2. infra/nginx/ssl/ 에 복사
# 3. Nginx 재로드
docker compose exec nginx nginx -s reload

# [3] 갱신 확인
echo | openssl s_client -servername localhost -connect localhost:443 2>/dev/null | \
  openssl x509 -noout -dates -subject
```

**예방**: 인증서 만료 30일 전 알림 설정 (모니터링 대시보드)

---

### 5.7 감사 로그 해시 체인 끊김

**증상**: 해시 체인 검증에서 `brokenAt` 값이 반환됨 (`valid: false`), FIM 알림 발생

> **PCI DSS 10.2**: 감사 로그의 무결성을 보장한다.
> **PCI DSS 10.5**: 감사 추적을 변조로부터 보호한다.

**대응 절차**:

```
[1] 해시 체인 끊김 감지
    │
    ▼
[2] 끊긴 지점 확인 (brokenAt logId)
    │
    ├── 의도된 변경 (DB 마이그레이션 등) → [3a] 해시 체인 리빌드 (개발팀)
    │
    └── 비인가 변경 → [3b] 보안 사고 대응 절차 진입
        ├── 변경된 로그 내용 확인
        ├── 접근 로그 분석 (누가 DB에 접근했는지)
        └── CTO + 보안팀 에스컬레이션
```

**명령어**:

```bash
# [1] 해시 체인 검증 실행 (API 직접 호출 또는 관리자 대시보드에서)
# 최근 7일 감사 로그 검증
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT id, action, log_hash, prev_hash, created_at
   FROM audit_logs
   ORDER BY created_at DESC
   LIMIT 20;"

# [2] 끊긴 지점 전후 로그 비교
# brokenAt ID 기준 전후 5개 조회
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT id, action, resource_type, ip_address, user_id, created_at
   FROM audit_logs
   WHERE id BETWEEN <brokenAt - 5> AND <brokenAt + 5>
   ORDER BY id;"
```

**보안 사고 판단 기준**:
- DB 마이그레이션 직후 발생 → 의도된 변경 (사고 아님)
- 마이그레이션 없이 발생 → **보안 사고 가능성** → 즉시 에스컬레이션
- 해당 시간대 DB 접근 로그 확인 필수

---

## 6. 사후분석 (Post-mortem) 템플릿

> P0, P1 장애 발생 시 반드시 작성한다.

```markdown
# 장애 사후분석 보고서

## 기본 정보

| 항목 | 내용 |
|------|------|
| 장애 번호 | INC-YYYYMMDD-NNN |
| 장애 등급 | P0 / P1 |
| 발생 일시 | YYYY-MM-DD HH:MM:SS KST |
| 복구 일시 | YYYY-MM-DD HH:MM:SS KST |
| 장애 시간 | X시간 Y분 |
| 작성자 | (이름) |
| 작성일 | YYYY-MM-DD |

## 영향 범위

- **영향받은 서비스**: (예: 결제 API, 가맹점 대시보드)
- **영향받은 사용자 수**: (예: 가맹점 150개, 거래 약 3,000건)
- **재정적 영향**: (예: 결제 처리 불가로 인한 매출 손실 추정)
- **SLA 위반 여부**: (예: P1 SLA 4시간 중 3시간 50분에 복구 — 준수)

## 타임라인

| 시간 (KST) | 이벤트 |
|-------------|--------|
| HH:MM | 장애 최초 감지 (모니터링 알림 / 고객 신고) |
| HH:MM | 담당 엔지니어 확인 시작 |
| HH:MM | 장애 등급 P_ 판정, 에스컬레이션 |
| HH:MM | 근본 원인 파악 |
| HH:MM | 긴급 조치 적용 |
| HH:MM | 서비스 복구 확인 |
| HH:MM | 모니터링 안정화 확인, 장애 종료 선언 |

## 근본 원인 (Root Cause)

(근본 원인을 기술적으로 정확하게 기술)

## 긴급 조치 내용

(복구를 위해 수행한 조치 목록)

## 재발 방지 대책

| # | 조치 항목 | 담당 | 기한 | 상태 |
|---|----------|------|------|------|
| 1 | (예: 커넥션 풀 모니터링 알림 추가) | (이름) | YYYY-MM-DD | TODO |
| 2 | (예: DB 쿼리 타임아웃 설정 추가) | (이름) | YYYY-MM-DD | TODO |
| 3 | (예: 장애 대응 훈련 실시) | (이름) | YYYY-MM-DD | TODO |

## 교훈 (Lessons Learned)

- 잘한 점: (예: 15분 이내 감지 및 초기 대응)
- 개선할 점: (예: 에스컬레이션 기준이 모호했음)

## 첨부

- 관련 로그 스크린샷
- 모니터링 대시보드 캡처
- Slack 대화 아카이브 링크
```

---

## 7. 커뮤니케이션 템플릿

### 7.1 장애 발생 공지 (고객용)

```
[PG 시스템 안내] 서비스 일시 장애

안녕하세요, PG 시스템 운영팀입니다.

현재 {서비스명}에 일시적인 장애가 발생하여 {영향 범위}에 불편이 있습니다.

■ 장애 발생 시각: YYYY년 MM월 DD일 HH:MM (KST)
■ 영향 범위: {예: 카드 결제 처리 지연}
■ 현재 상태: 원인 파악 중이며, 빠른 복구를 위해 조치 중입니다.

복구 완료 즉시 다시 안내드리겠습니다.
불편을 드려 진심으로 죄송합니다.

PG 시스템 운영팀
```

### 7.2 장애 복구 공지 (고객용)

```
[PG 시스템 안내] 서비스 복구 완료

안녕하세요, PG 시스템 운영팀입니다.

앞서 안내드린 {서비스명} 장애가 복구되었습니다.

■ 장애 발생: YYYY년 MM월 DD일 HH:MM (KST)
■ 복구 완료: YYYY년 MM월 DD일 HH:MM (KST)
■ 장애 시간: 약 X시간 Y분
■ 원인: {간단한 원인 설명}
■ 조치: {수행한 조치 요약}

현재 모든 서비스가 정상 운영 중입니다.
장애 기간 중 {처리 지연된 건}은 순차적으로 처리되고 있습니다.

재발 방지를 위해 근본 원인 분석 및 개선 조치를 진행하겠습니다.
이용에 불편을 드려 죄송합니다.

PG 시스템 운영팀
```

### 7.3 내부 보고 (Slack용)

```
🚨 [P{등급}] {장애 요약}

📅 발생: YYYY-MM-DD HH:MM KST
📍 영향: {영향 범위}
🔍 현황: {현재 상태 — 조사 중 / 조치 중 / 복구 완료}
👤 담당: @{담당자}

💡 다음 업데이트: {예상 시간}
```

---

## 8. 비상 연락망

| 역할 | 담당자 | 연락처 | 비고 |
|------|--------|--------|------|
| 당직 엔지니어 (L1) | (이름) | (전화번호) | 주간 로테이션 |
| 백업 엔지니어 | (이름) | (전화번호) | L1 부재 시 |
| 팀장 / 시니어 (L2) | (이름) | (전화번호) | |
| CTO (L3) | (이름) | (전화번호) | P0, 데이터 유출 시 |
| 경영진 (L4) | (이름) | (전화번호) | P0 2시간 초과 시 |
| 법무팀 | (이름) | (전화번호) | 개인정보 유출 시 |
| DB 관리자 | (이름) | (전화번호) | DB 장애 시 |
| 외부 PG 연동 담당 | (이름) | (전화번호) | 결제 연동 이슈 시 |
| 호스팅/ISP 지원 | (이름) | (전화번호) | 네트워크/인프라 이슈 시 |

> **중요**: 이 연락망은 분기별로 갱신한다. 담당자 변경 시 즉시 업데이트.

---

## 9. 부록: 진단 명령어 모음

### 서비스 상태 확인

```bash
# 전체 컨테이너 상태
docker compose ps

# 특정 서비스 로그 (최근 200줄)
docker compose logs --tail=200 <service>

# 실시간 로그 추적
docker compose logs -f <service>

# 컨테이너 리소스 사용량
docker stats --no-stream
```

### 데이터베이스 진단

```bash
# DB 연결 가능 여부
docker compose exec db pg_isready -U ${POSTGRES_USER}

# 활성 커넥션 수
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# 테이블별 크기
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC
   LIMIT 10;"

# 잠금(Lock) 상태
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT pid, relation::regclass, mode, granted
   FROM pg_locks
   WHERE NOT granted;"

# DB 크기
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

### 네트워크 진단

```bash
# Nginx 연결 상태
docker compose exec nginx nginx -t

# TLS 인증서 확인
echo | openssl s_client -servername localhost -connect localhost:443 2>/dev/null | \
  openssl x509 -noout -dates -subject

# API 응답 시간 측정
curl -o /dev/null -s -w "HTTP %{http_code} | Total: %{time_total}s | Connect: %{time_connect}s\n" \
  -k https://localhost/api/v1/health

# DNS 확인 (외부 PG 연동 시)
dig +short pg-gateway.example.com
```

### 보안 진단

```bash
# 최근 로그인 실패 확인
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT user_id, ip_address, count(*) as fail_count
   FROM audit_logs
   WHERE action = 'LOGIN_FAILED'
   AND created_at > now() - interval '1 hour'
   GROUP BY user_id, ip_address
   HAVING count(*) >= 3
   ORDER BY fail_count DESC;"

# Risk Alert 확인 (최근)
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT severity, title, status, created_at
   FROM risk_alerts
   WHERE created_at > now() - interval '24 hours'
   ORDER BY created_at DESC;"

# FIM 최근 결과 확인
docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c \
  "SELECT action, detail, created_at
   FROM audit_logs
   WHERE action IN ('FIM_ALERT', 'FIM_CHECK_PASS')
   ORDER BY created_at DESC
   LIMIT 5;"
```

---

> **문서 관리**: 이 매뉴얼은 분기별로 검토하고, 장애 발생 시 대응 절차를 실제로 따라했는지 점검한다.
> **훈련**: 연 2회 장애 대응 모의훈련(Tabletop Exercise)을 실시한다. (PCI DSS 12.10.2)
