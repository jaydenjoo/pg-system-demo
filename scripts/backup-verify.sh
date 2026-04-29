#!/usr/bin/env bash
# backup-verify.sh — PG System 백업 무결성 검증 스크립트
# 가장 최근 백업을 임시 DB에 복원 후 원본과 비교
#
# 사용법:
#   ./scripts/backup-verify.sh              # 최신 백업 검증
#   ./scripts/backup-verify.sh /path/to/backup.dump.enc
#   ./scripts/backup-verify.sh --help

set -euo pipefail

# ── 상수 ──────────────────────────────────────────────────────────────────────
SCRIPT_NAME="$(basename "$0")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backups}"
BACKUP_DAILY_DIR="${BACKUP_BASE_DIR}/daily"
BACKUP_LOG_DIR="${BACKUP_BASE_DIR}/logs"
REPORT_DIR="${BACKUP_BASE_DIR}/reports"
LOG_FILE="${BACKUP_LOG_DIR}/verify_${TIMESTAMP}.log"
REPORT_FILE="${REPORT_DIR}/verify_report_${TIMESTAMP}.txt"
TEMP_DUMP="/tmp/pg_verify_${TIMESTAMP}.dump"
TEMP_DB_NAME="pg_verify_${TIMESTAMP}"

# ── 환경변수 기본값 ────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-pgdb}"
DB_USER="${DB_USER:-pgadmin}"

# ── 핵심 테이블 목록 (카운트 비교 대상) ──────────────────────────────────────
KEY_TABLES=(
  "users"
  "merchants"
  "agents"
  "transactions"
  "settlements"
  "deposits"
  "audit_logs"
)

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
사용법: ${SCRIPT_NAME} [백업파일경로]

인자:
  백업파일경로   검증할 .dump.enc 파일 경로 (생략 시 최신 백업 자동 선택)

필수 환경변수:
  PGPASSWORD           데이터베이스 비밀번호
  BACKUP_ENCRYPTION_KEY 백업 파일 복호화 키

선택 환경변수:
  SLACK_WEBHOOK_URL    검증 실패 시 Slack 알림 URL

예시:
  # 최신 백업 검증
  ./scripts/backup-verify.sh

  # 특정 백업 파일 검증
  ./scripts/backup-verify.sh /backups/daily/pg_system_20260301_020000.dump.enc
EOF
  exit 0
}

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
BACKUP_FILE=""

for arg in "$@"; do
  case "${arg}" in
    --help) usage ;;
    -*)
      echo "[오류] 알 수 없는 옵션: ${arg}" >&2
      exit 1
      ;;
    *)
      BACKUP_FILE="${arg}"
      ;;
  esac
done

# ── 로그 함수 ─────────────────────────────────────────────────────────────────
log() {
  local level="$1"
  local msg="$2"
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${msg}"
  echo "${line}"
  if [[ -d "${BACKUP_LOG_DIR}" ]]; then
    echo "${line}" >> "${LOG_FILE}"
    echo "${line}" >> "${REPORT_FILE}"
  fi
}

log_info()  { log "INFO " "$1"; }
log_warn()  { log "WARN " "$1"; }
log_error() { log "ERROR" "$1"; }

# ── 리포트 헤더 ───────────────────────────────────────────────────────────────
write_report_header() {
  cat >> "${REPORT_FILE}" <<EOF
================================================================
PG System 백업 무결성 검증 리포트
검증 시각: $(date '+%Y-%m-%d %H:%M:%S UTC')
백업 파일: $(basename "${BACKUP_FILE}")
원본 DB:   ${DB_HOST}:${DB_PORT}/${DB_NAME}
================================================================

EOF
}

# ── Slack 알림 ────────────────────────────────────────────────────────────────
notify_slack() {
  local status="$1"   # success | failure
  local detail="$2"

  if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
    return 0
  fi

  local color icon
  if [[ "${status}" == "success" ]]; then
    color="good"; icon=":white_check_mark:"
  else
    color="danger"; icon=":x:"
  fi

  local payload
  payload=$(cat <<JSON
{
  "text": "${icon} *PG System 백업 검증 ${status}*",
  "attachments": [{
    "color": "${color}",
    "fields": [
      {"title": "백업 파일", "value": "$(basename "${BACKUP_FILE}")", "short": false},
      {"title": "상세", "value": "${detail}", "short": false},
      {"title": "시각", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true}
    ]
  }]
}
JSON
)
  curl -s -X POST \
    -H 'Content-type: application/json' \
    --data "${payload}" \
    "${SLACK_WEBHOOK_URL}" \
    --max-time 10 \
    -o /dev/null || true
}

# ── 클린업 ────────────────────────────────────────────────────────────────────
cleanup() {
  rm -f "${TEMP_DUMP}" 2>/dev/null || true

  # 임시 DB 삭제
  if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
      -d postgres -tc \
      "SELECT 1 FROM pg_database WHERE datname='${TEMP_DB_NAME}'" \
      2>/dev/null | grep -q 1; then
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
      -d postgres \
      -c "DROP DATABASE IF EXISTS \"${TEMP_DB_NAME}\";" \
      2>/dev/null || true
    log_info "임시 검증 DB 삭제 완료: ${TEMP_DB_NAME}"
  fi
}

trap cleanup EXIT

# ── 사전 검증 ─────────────────────────────────────────────────────────────────
validate_env() {
  if [[ -z "${PGPASSWORD:-}" ]]; then
    log_error "PGPASSWORD 환경변수가 설정되지 않았습니다."
    exit 2
  fi

  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    log_error "BACKUP_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다."
    exit 2
  fi

  for tool in psql pg_restore openssl sha256sum createdb dropdb; do
    if ! command -v "${tool}" &>/dev/null; then
      log_error "필요 도구 없음: ${tool}"
      exit 3
    fi
  done

  if [[ -z "${BACKUP_FILE}" ]]; then
    # 최신 백업 자동 선택
    BACKUP_FILE="$(find "${BACKUP_DAILY_DIR}" -name "pg_system_*.dump.enc" | sort | tail -n 1)"
    if [[ -z "${BACKUP_FILE}" ]]; then
      log_error "검증할 백업 파일이 없습니다: ${BACKUP_DAILY_DIR}"
      exit 1
    fi
    log_info "검증 대상 자동 선택: $(basename "${BACKUP_FILE}")"
  fi

  if [[ ! -f "${BACKUP_FILE}" ]]; then
    log_error "백업 파일을 찾을 수 없습니다: ${BACKUP_FILE}"
    exit 1
  fi
}

# ── 체크섬 검증 ───────────────────────────────────────────────────────────────
verify_checksum() {
  local sha_file="${BACKUP_FILE}.sha256"
  if [[ ! -f "${sha_file}" ]]; then
    log_warn "체크섬 파일 없음 — 무결성 검증 건너뜀"
    return 0
  fi

  log_info "SHA-256 체크섬 검증 중..."
  if sha256sum --check "${sha_file}" --quiet 2>/dev/null; then
    log_info "체크섬 검증 통과 ✓"
  else
    log_error "체크섬 불일치 — 백업 파일이 손상되었을 수 있습니다."
    notify_slack "failure" "체크섬 불일치 — 백업 파일 손상 의심"
    exit 5
  fi
}

# ── 복호화 ────────────────────────────────────────────────────────────────────
decrypt_backup() {
  log_info "백업 파일 복호화 중..."
  if ! openssl enc -aes-256-cbc \
    -d \
    -salt \
    -pbkdf2 \
    -iter 100000 \
    -pass "env:BACKUP_ENCRYPTION_KEY" \
    -in "${BACKUP_FILE}" \
    -out "${TEMP_DUMP}"; then
    log_error "복호화 실패"
    exit 6
  fi
  log_info "복호화 완료"
}

# ── 임시 DB 생성 및 복원 ──────────────────────────────────────────────────────
restore_to_temp_db() {
  log_info "임시 검증 DB 생성: ${TEMP_DB_NAME}"
  createdb \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    "${TEMP_DB_NAME}"

  log_info "임시 DB에 복원 중..."
  if ! pg_restore \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${TEMP_DB_NAME}" \
    --no-password \
    --exit-on-error \
    "${TEMP_DUMP}" 2>&1 | tee -a "${LOG_FILE}"; then
    log_error "임시 DB 복원 실패"
    exit 7
  fi
  log_info "임시 DB 복원 완료"
}

# ── 테이블 카운트 비교 ────────────────────────────────────────────────────────
compare_table_counts() {
  log_info ""
  log_info "── 테이블 카운트 비교 ────────────────────────────────"
  log_info "  테이블명                원본      복원본   일치"
  log_info "  ─────────────────────  ────────  ────────  ────"

  local total_ok=0
  local total_fail=0
  local summary=""

  for table in "${KEY_TABLES[@]}"; do
    # 원본 DB 카운트
    local orig_count
    orig_count="$(psql \
      -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
      -t -c "SELECT COUNT(*) FROM ${table} 2>/dev/null;" \
      2>/dev/null | tr -d ' \n' || echo 'N/A')"

    # 복원 DB 카운트
    local rest_count
    rest_count="$(psql \
      -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${TEMP_DB_NAME}" \
      -t -c "SELECT COUNT(*) FROM ${table} 2>/dev/null;" \
      2>/dev/null | tr -d ' \n' || echo 'N/A')"

    local match_str
    if [[ "${orig_count}" == "${rest_count}" && "${orig_count}" != "N/A" ]]; then
      match_str="✓"
      ((total_ok++)) || true
    else
      match_str="✗ 불일치"
      ((total_fail++)) || true
    fi

    printf "  %-22s  %8s  %8s  %s\n" \
      "${table}" "${orig_count}" "${rest_count}" "${match_str}" \
      | tee -a "${LOG_FILE}" >> "${REPORT_FILE}"

    summary+="${table}: 원본=${orig_count} 복원=${rest_count} | "
  done

  log_info "  ─────────────────────────────────────────────────"
  log_info "  결과: 일치 ${total_ok}개 / 불일치 ${total_fail}개"
  log_info ""

  if [[ ${total_fail} -gt 0 ]]; then
    log_warn "일부 테이블 카운트 불일치 — 상세 확인 필요"
    notify_slack "failure" "테이블 카운트 불일치 ${total_fail}개 발견\n${summary}"
    return 1
  fi

  return 0
}

# ── 리포트 푸터 ───────────────────────────────────────────────────────────────
write_report_footer() {
  local result="$1"
  cat >> "${REPORT_FILE}" <<EOF

================================================================
검증 결과: ${result}
완료 시각: $(date '+%Y-%m-%d %H:%M:%S UTC')
리포트 파일: ${REPORT_FILE}
================================================================
EOF
}

# ── 메인 ─────────────────────────────────────────────────────────────────────
main() {
  mkdir -p "${BACKUP_LOG_DIR}" "${REPORT_DIR}"

  # 리포트 파일 초기화 (헤더는 파일 선택 후)
  touch "${REPORT_FILE}"

  validate_env
  write_report_header

  log_info "================================================================"
  log_info "PG System 백업 무결성 검증 시작"
  log_info "================================================================"

  verify_checksum
  decrypt_backup
  restore_to_temp_db

  local verify_result=0
  compare_table_counts || verify_result=1

  if [[ ${verify_result} -eq 0 ]]; then
    write_report_footer "성공 ✓"
    log_info "================================================================"
    log_info "검증 완료: 백업 무결성 확인됨 ✓"
    log_info "  리포트: ${REPORT_FILE}"
    log_info "================================================================"
    notify_slack "success" "모든 테이블 카운트 일치 — 백업 무결성 확인"
    exit 0
  else
    write_report_footer "실패 ✗"
    log_error "================================================================"
    log_error "검증 실패: 상세 리포트를 확인하세요"
    log_error "  리포트: ${REPORT_FILE}"
    log_error "================================================================"
    exit 8
  fi
}

main "$@"
