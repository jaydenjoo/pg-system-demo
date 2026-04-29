# Runbook: 데이터베이스 백업 & 복구

> PG System 운영팀 전용 — 대외비
> 최종 업데이트: 2026-03-01
> 담당자: 인프라/DevOps 팀

---

## 백업 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        pg-internal 네트워크                      │
│                                                                  │
│  ┌──────────────┐    pg_dump     ┌───────────────────────────┐  │
│  │  pg-system-  │ ─────────────► │   pg-system-backup        │  │
│  │  db          │                │   (postgres:16-alpine)    │  │
│  │  (PostgreSQL)│                │                           │  │
│  └──────────────┘                │  crontab:                 │  │
│                                  │  ・매일 02:00 UTC 백업     │  │
│                                  │  ・매주 일 04:00 UTC 검증  │  │
│                                  └──────────┬────────────────┘  │
└─────────────────────────────────────────────┼────────────────────┘
                                              │
                              ┌───────────────▼────────────────┐
                              │      backup-data 볼륨           │
                              │  /backups/                      │
                              │  ├── daily/                     │
                              │  │   ├── pg_system_YYYYMMDD.    │
                              │  │   │   dump.enc (AES-256)     │
                              │  │   └── *.sha256 (체크섬)      │
                              │  ├── snapshots/ (복원 전 저장)  │
                              │  ├── reports/ (검증 리포트)     │
                              │  └── logs/ (실행 로그)          │
                              └───────────────┬────────────────┘
                                              │ (선택) aws s3 cp
                              ┌───────────────▼────────────────┐
                              │   S3 버킷 (STANDARD_IA)        │
                              │   s3://버킷명/pg-system/        │
                              │   backups/daily/               │
                              └────────────────────────────────┘

백업 흐름:
  1. pg_dump (custom format, compress=9)
  2. openssl enc -aes-256-cbc -pbkdf2 (암호화)
  3. sha256sum (체크섬 생성)
  4. (선택) aws s3 cp (S3 업로드)
  5. 30일 초과 파일 자동 삭제
```

### RTO / RPO 목표
| 지표 | 목표 | 설명 |
|------|------|------|
| **RPO** (데이터 유실 허용 시간) | **24시간** | 일일 02:00 UTC 자동 백업 |
| **RTO** (서비스 복구 목표 시간) | **1시간** | 최신 백업에서 전체 복원 기준 |

---

## 1. 일일 백업 프로세스

### 자동 실행 (정상 운영)
- **스케줄**: 매일 02:00 UTC (KST 11:00)
- **실행 주체**: `pg-system-backup` 컨테이너의 crond
- **로그 확인**:
  ```bash
  docker exec pg-system-backup tail -f /backups/logs/cron_backup.log
  # 또는 날짜별 로그
  docker exec pg-system-backup cat /backups/logs/backup_20260301.log
  ```

### 백업 파일 목록 확인
```bash
docker exec pg-system-backup ls -lh /backups/daily/
# 예시 출력:
# -rw-r--r-- 1 root root 45M Mar 01 02:01 pg_system_20260301_020000.dump.enc
# -rw-r--r-- 1 root root 98 Mar 01 02:01 pg_system_20260301_020000.dump.enc.sha256
```

---

## 2. 수동 백업 실행

### 기본 수동 백업
```bash
# 백업 컨테이너에서 직접 실행
docker exec pg-system-backup /scripts/backup-database.sh

# 호스트 머신에서 스크립트 직접 실행 (DB 접근 가능한 환경)
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=pgdb
export DB_USER=pgadmin
export PGPASSWORD="your-db-password"
export BACKUP_ENCRYPTION_KEY="your-encryption-key"

./scripts/backup-database.sh
```

### dry-run (실제 백업 없이 설정 확인)
```bash
docker exec pg-system-backup \
  /scripts/backup-database.sh --dry-run

# 출력 예시:
# [INFO ] DB 호스트:   db:5432
# [INFO ] DB 이름:     pgdb
# [INFO ] DB 연결 정상
# [INFO ] === DRY-RUN 완료 — 실제 백업은 수행되지 않음 ===
```

### S3 업로드 포함
```bash
# BACKUP_S3_BUCKET 환경변수 설정 필요
docker exec -e BACKUP_S3_BUCKET="your-bucket-name" \
  pg-system-backup \
  /scripts/backup-database.sh --s3
```

---

## 3. 전체 복원 절차 (전체 DB 손실 시)

> **⚠️ 경고**: 이 절차는 현재 DB 데이터를 완전히 덮어씁니다.
> 복원 전 현재 스냅샷이 자동 저장됩니다 (`/backups/snapshots/`).

### 단계별 복원

**Step 1: 사용 가능한 백업 목록 확인**
```bash
docker exec pg-system-backup ls -lt /backups/daily/ | head -20
```

**Step 2: 체크섬 수동 검증 (선택)**
```bash
docker exec pg-system-backup bash -c "
  cd /backups/daily/
  sha256sum --check pg_system_20260301_020000.dump.enc.sha256
"
# 출력: pg_system_20260301_020000.dump.enc: OK
```

**Step 3: 복원 실행**
```bash
# 최신 백업으로 자동 복원
docker exec -it pg-system-backup \
  /scripts/restore-database.sh --latest

# 또는 특정 파일 지정
docker exec -it pg-system-backup \
  /scripts/restore-database.sh \
  /backups/daily/pg_system_20260301_020000.dump.enc
```

**Step 4: 복원 결과 확인**
```bash
# 복원 로그 확인
docker exec pg-system-backup ls -lt /backups/logs/restore_*.log | head -5
docker exec pg-system-backup cat /backups/logs/restore_20260301_120000.log

# API 서비스 재시작 (Prisma 연결 갱신)
docker compose restart api
```

**Step 5: 서비스 정상 여부 확인**
```bash
# API 헬스체크
curl -f http://localhost/api/v1/health/live

# 핵심 테이블 레코드 수 확인
docker exec pg-system-db psql -U pgadmin -d pgdb -c "
  SELECT 'users' AS table_name, COUNT(*) FROM users
  UNION ALL SELECT 'merchants', COUNT(*) FROM merchants
  UNION ALL SELECT 'transactions', COUNT(*) FROM transactions;
"
```

---

## 4. 특정 테이블 복원

데이터 실수 삭제 등으로 특정 테이블만 복원해야 할 때 사용합니다.

```bash
# users 테이블만 복원
docker exec -it pg-system-backup \
  /scripts/restore-database.sh \
  --table users \
  /backups/daily/pg_system_20260301_020000.dump.enc

# merchants 테이블만 복원
docker exec -it pg-system-backup \
  /scripts/restore-database.sh \
  --table merchants \
  --latest
```

> **주의**: 테이블 간 외래키 의존성이 있을 경우 순서에 주의하세요.
> 예: `merchants` 복원 전에 `agents`가 먼저 복원되어야 할 수 있습니다.

---

## 5. 백업 무결성 검증

### 자동 검증 (주간)
- **스케줄**: 매주 일요일 04:00 UTC (KST 13:00)
- **로그**: `/backups/logs/cron_verify.log`
- **리포트**: `/backups/reports/verify_report_*.txt`

### 수동 검증
```bash
# 최신 백업 검증
docker exec pg-system-backup /scripts/backup-verify.sh

# 특정 파일 검증
docker exec pg-system-backup \
  /scripts/backup-verify.sh \
  /backups/daily/pg_system_20260301_020000.dump.enc

# 리포트 확인
docker exec pg-system-backup \
  cat /backups/reports/verify_report_20260301_040000.txt
```

### 검증 리포트 예시
```
================================================================
PG System 백업 무결성 검증 리포트
검증 시각: 2026-03-01 04:00:00 UTC
백업 파일: pg_system_20260228_020000.dump.enc
원본 DB:   db:5432/pgdb
================================================================

── 테이블 카운트 비교 ────────────────────────────────
  테이블명                원본      복원본   일치
  ─────────────────────  ────────  ────────  ────
  users                      1523      1523  ✓
  merchants                   847       847  ✓
  agents                      124       124  ✓
  transactions             182340    182340  ✓
  settlements               12450     12450  ✓
  deposits                   8921      8921  ✓
  audit_logs              541293    541293  ✓
  ─────────────────────────────────────────────────
  결과: 일치 7개 / 불일치 0개

================================================================
검증 결과: 성공 ✓
================================================================
```

---

## 6. PITR (Point-in-Time Recovery) 가이드

### 개념 설명
PITR은 WAL(Write-Ahead Log)을 활용해 특정 시점으로 DB를 되돌리는 기술입니다.
"어제 오후 2시 33분의 DB 상태"로 정확히 복원 가능합니다.

현재 구성은 **일일 전체 백업** 방식 (RPO 24시간)입니다.
RPO를 더 줄이려면(예: 1시간) 아래 WAL 아카이빙 설정이 필요합니다.

### WAL 아카이빙 설정 (선택 사항)

**postgresql.conf 수정** (`infra/postgres/postgresql.conf`):
```conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://버킷명/pg-system/wal/%f'
archive_timeout = 300   # 5분마다 WAL 강제 아카이빙
```

**기본 백업 설정**:
```bash
# pg_basebackup으로 기본 백업 (WAL 아카이빙 시작점)
pg_basebackup -h db -U pgadmin -D /backups/basebackup -Ft -z -P
```

**PITR 복원** (특정 시점으로):
```bash
# recovery.conf (PostgreSQL 12+는 postgresql.conf에 통합)
restore_command = 'aws s3 cp s3://버킷명/pg-system/wal/%f %p'
recovery_target_time = '2026-03-01 14:33:00'
recovery_target_action = 'promote'
```

---

## 7. 장애 시나리오별 복구 전략

### 시나리오 A: DB 서버 완전 손실

**상황**: 서버 하드웨어 장애, 볼륨 손상 등으로 DB 데이터 전체 손실

**복구 절차**:
1. 새 DB 컨테이너/서버 준비
   ```bash
   docker compose up -d db
   # DB가 빈 상태로 초기화됨
   ```
2. 최신 백업으로 전체 복원
   ```bash
   docker exec -it pg-system-backup \
     /scripts/restore-database.sh --latest
   ```
3. Prisma 마이그레이션 상태 확인
   ```bash
   docker exec pg-system-api \
     npx prisma migrate status
   ```
4. API 서비스 재시작 및 헬스체크
   ```bash
   docker compose restart api
   curl -f http://localhost/api/v1/health/live
   ```

**예상 RTO**: 30~60분

---

### 시나리오 B: 실수로 데이터 삭제

**상황**: 관리자 실수로 특정 테이블 또는 레코드 삭제

**복구 절차**:
1. 삭제 시점 파악 (audit_logs 조회)
   ```sql
   SELECT action, table_name, record_id, performed_at, performed_by
   FROM audit_logs
   WHERE action = 'DELETE'
     AND performed_at > NOW() - INTERVAL '1 hour'
   ORDER BY performed_at DESC;
   ```
2. 삭제 직전 백업 파일 식별
   ```bash
   docker exec pg-system-backup ls -lt /backups/daily/
   ```
3. 특정 테이블만 복원
   ```bash
   docker exec -it pg-system-backup \
     /scripts/restore-database.sh \
     --table merchants \
     /backups/daily/pg_system_20260301_020000.dump.enc
   ```
4. 복원 후 검증
   ```bash
   docker exec pg-system-db psql -U pgadmin -d pgdb \
     -c "SELECT COUNT(*) FROM merchants;"
   ```

**예상 RTO**: 15~30분

---

### 시나리오 C: 데이터 손상 (PITR)

**상황**: 잘못된 마이그레이션, 악성 코드 등으로 데이터 손상

**복구 절차**:
1. 손상 발생 시각 특정 (로그, audit_logs 등)
2. 손상 직전 백업으로 복원
   ```bash
   # 특정 백업 파일로 복원 (손상 발생 이전 시점)
   docker exec -it pg-system-backup \
     /scripts/restore-database.sh \
     /backups/daily/pg_system_20260228_020000.dump.enc
   ```
3. WAL 아카이빙 구성된 경우: PITR로 분 단위 복원 가능
   - `recovery_target_time`을 손상 발생 1분 전으로 설정
4. 복원 후 전체 무결성 검증
   ```bash
   docker exec pg-system-backup /scripts/backup-verify.sh
   ```
5. 원인 분석 및 재발 방지 조치

**예상 RTO**: 30~120분 (손상 범위에 따라 상이)

---

## 8. 백업 모니터링

### 일일 로그 확인 (운영 체크리스트)
```bash
# 어제 백업 성공 여부 확인
docker exec pg-system-backup grep "백업 완료" \
  /backups/logs/backup_$(date -d yesterday +%Y%m%d).log

# 최근 7일 백업 파일 확인
docker exec pg-system-backup \
  find /backups/daily/ -name "*.dump.enc" -mtime -7 -ls
```

### 백업 용량 모니터링
```bash
# 볼륨 전체 사용량
docker exec pg-system-backup du -sh /backups/

# 일별 백업 크기 추이
docker exec pg-system-backup \
  du -sh /backups/daily/pg_system_*.dump.enc | sort -k2
```

### Prometheus 알럿 (권장 추가 설정)
```yaml
# infra/monitoring/prometheus/rules/backup.yml
groups:
  - name: backup
    rules:
      - alert: BackupFileMissing
        expr: |
          (time() - backup_last_success_timestamp) > 90000
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "24시간 이상 백업 미완료"
```

---

## 9. 환경변수 설정 참조

`.env` 파일에 추가해야 할 백업 관련 설정:

```bash
# 백업 암호화 키 (필수 — 분실 시 복원 불가)
BACKUP_ENCRYPTION_KEY=your-strong-encryption-key-min-32chars

# 백업 보관 기간 (기본 30일)
BACKUP_RETENTION_DAYS=30

# S3 업로드 (선택)
BACKUP_S3_BUCKET=your-bucket-name

# Slack 알림 (선택)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

> **⚠️ 주의**: `BACKUP_ENCRYPTION_KEY`는 안전한 곳(AWS Secrets Manager, HashiCorp Vault)에 별도 보관하세요.
> 이 키를 분실하면 모든 암호화 백업을 복원할 수 없습니다.

---

## 10. 비상 연락망

| 상황 | 담당자 | 연락처 |
|------|--------|--------|
| DB 복원 필요 | 인프라 담당자 | — |
| 백업 파일 손상 | DevOps 팀 | — |
| S3 접근 불가 | AWS 계정 담당자 | — |
| 법적 요구 (감사) | 보안/컴플라이언스 | — |
