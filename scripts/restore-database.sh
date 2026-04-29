#!/usr/bin/env bash
# restore-database.sh — PG System PostgreSQL 복원 스크립트
#
# 사용법:
#   ./scripts/restore-database.sh /backups/daily/pg_system_20260301_020000.dump.enc
#   ./scripts/restore-database.sh --latest
#   ./scripts/restore-database.sh --table users /backups/daily/pg_system_20260301_020000.dump.enc
#   ./scripts/restore-database.sh --help

set -euo pipefail

# ── 상수 ──────────────────────────────────────────────────────────────────────
SCRIPT_NAME="$(basename "$0")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backups}"
BACKUP_DAILY_DIR="${BACKUP_BASE_DIR}/daily"
BACKUP_LOG_DIR="${BACKUP_BASE_DIR}/logs"
SNAPSHOT_DIR="${BACKUP_BASE_DIR}/snapshots"
LOG_FILE="${BACKUP_LOG_DIR}/restore_${TIMESTAMP}.log"
TEMP_DUMP="/tmp/pg_restore_${TIMESTAMP}.dump"

# ── 환경변수 기본값 ────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-pgdb}"
DB_USER="${DB_USER:-pgadmin}"

# ── 플래그 ────────────────────────────────────────────────────────────────────
RESTORE_LATEST=false
TARGET_TABLE=""
BACKUP_FILE=""

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
사용법: ${SCRIPT_NAME} [옵션] [백업파일경로]

옵션:
  --latest            가장 최근 백업으로 복원
  --table <테이블명>  특정 테이블만 복원
  --help              이 도움말 출력

필수 환경변수:
  PGPASSWORD           데이터베이스 비밀번호
  BACKUP_ENCRYPTION_KEY 백업 파일 AES-256 복호화 키

예시:
  # 특정 백업 파일로 전체 복원
  ./scripts/restore-database.sh /backups/daily/pg_system_20260301_020000.dump.enc

  # 가장 최근 백업으로 복원
  ./scripts/restore-database.sh --latest

  # 특정 테이블만 복원
  ./scripts/restore-database.sh --table users /backups/daily/pg_system_20260301_020000.dump.enc

경고:
  이 스크립트는 기존 데이터를 덮어씁니다.
  복원 전에 현재 DB 스냅샷이 자동으로 저장됩니다.
EOF
  exit 0
}

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help)
        usage
        ;;
      --latest)
        RESTORE_LATEST=true
        shift
        ;;
      --table)
        if [[ -z "${2:-}" ]]; then
          echo "[오류] --table 옵션에 테이블명이 필요합니다." >&2
          exit 1
        fi
        TARGET_TABLE="$2"
        shift 2
        ;;
      -*)
        echo "[오류] 알 수 없는 옵션: $1" >&2
        echo "사용법: ${SCRIPT_NAME} --help" >&2
        exit 1
        ;;
      *)
        BACKUP_FILE="$1"
        shift
        ;;
    esac
  done

  # 백업 파일 결정
  if [[ "${RESTORE_LATEST}" == true ]]; then
    BACKUP_FILE="$(find "${BACKUP_DAILY_DIR}" -name "pg_system_*.dump.enc" | sort | tail -n 1)"
    if [[ -z "${BACKUP_FILE}" ]]; then
      log_error "복원 가능한 백업 파일이 없습니다: ${BACKUP_DAILY_DIR}"
      exit 1
    fi
  fi

  if [[ -z "${BACKUP_FILE}" ]]; then
    echo "[오류] 백업 파일 경로 또는 --latest 옵션이 필요합니다." >&2
    echo "사용법: ${SCRIPT_NAME} --help" >&2
    exit 1
  fi
}

# ── 로그 함수 ─────────────────────────────────────────────────────────────────
log() {
  local level="$1"
  local msg="$2"
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${msg}"
  echo "${line}"
  if [[ -d "${BACKUP_LOG_DIR}" ]]; then
    echo "${line}" >> "${LOG_FILE}"
  fi
}

log_info()  { log "INFO " "$1"; }
log_warn()  { log "WARN " "$1"; }
log_error() { log "ERROR" "$1"; }

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

  for tool in pg_restore pg_dump openssl sha256sum psql; do
    if ! command -v "${tool}" &>/dev/null; then
      log_error "필요 도구 없음: ${tool}"
      exit 3
    fi
  done

  if [[ ! -f "${BACKUP_FILE}" ]]; then
    log_error "백업 파일을 찾을 수 없습니다: ${BACKUP_FILE}"
    exit 1
  fi
}

# ── DB 연결 확인 ──────────────────────────────────────────────────────────────
check_db_connection() {
  log_info "DB 연결 확인 중 (${DB_HOST}:${DB_PORT}/${DB_NAME})..."
  if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -q; then
    log_error "DB 연결 실패"
    exit 4
  fi
  log_info "DB 연결 정상"
}

# ── 체크섬 검증 ───────────────────────────────────────────────────────────────
verify_checksum() {
  local sha_file="${BACKUP_FILE}.sha256"
  if [[ ! -f "${sha_file}" ]]; then
    log_warn "체크섬 파일 없음 — 무결성 검증 건너뜀: ${sha_file}"
    return 0
  fi

  log_info "SHA-256 체크섬 검증 중..."
  if ! sha256sum --check "${sha_file}" --quiet 2>/dev/null; then
    log_error "체크섬 불일치! 백업 파일이 손상되었습니다."
    exit 5
  fi
  log_info "체크섬 검증 통과"
}

# ── 현재 DB 스냅샷 저장 (안전장치) ────────────────────────────────────────────
save_snapshot() {
  mkdir -p "${SNAPSHOT_DIR}"
  local snapshot_file="${SNAPSHOT_DIR}/pre_restore_${TIMESTAMP}.dump"

  log_info "복원 전 현재 DB 스냅샷 저장 중..."
  if ! pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=custom \
    --compress=9 \
    --no-password \
    --file="${snapshot_file}"; then
    log_warn "스냅샷 저장 실패 — 계속 진행합니다 (복원 전 백업 없음)"
    return 0
  fi

  log_info "스냅샷 저장 완료: ${snapshot_file}"
  log_warn "문제 발생 시 이 파일로 되돌릴 수 있습니다."
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
    log_error "복호화 실패 — 암호화 키를 확인하세요."
    rm -f "${TEMP_DUMP}"
    exit 6
  fi
  log_info "복호화 완료: ${TEMP_DUMP}"
}

# ── pg_restore 실행 ───────────────────────────────────────────────────────────
run_restore() {
  local restore_opts=(
    -h "${DB_HOST}"
    -p "${DB_PORT}"
    -U "${DB_USER}"
    -d "${DB_NAME}"
    --clean
    --if-exists
    --no-password
    --verbose
  )

  if [[ -n "${TARGET_TABLE}" ]]; then
    restore_opts+=(--table "${TARGET_TABLE}")
    log_info "복원 시작 (테이블: ${TARGET_TABLE})..."
  else
    log_info "전체 복원 시작..."
  fi

  if ! pg_restore "${restore_opts[@]}" "${TEMP_DUMP}" 2>&1 | tee -a "${LOG_FILE}"; then
    log_error "pg_restore 실패"
    rm -f "${TEMP_DUMP}"
    exit 7
  fi

  rm -f "${TEMP_DUMP}"
  log_info "복원 완료"
}

# ── 복원 후 테이블 카운트 확인 ────────────────────────────────────────────────
verify_restore() {
  log_info "복원 결과 검증 중..."

  local key_tables=("users" "merchants" "transactions" "settlements")
  local all_ok=true

  for table in "${key_tables[@]}"; do
    local count
    count="$(psql \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -t \
      -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo 'ERROR')"

    if [[ "${count}" == "ERROR" ]]; then
      log_warn "테이블 조회 실패: ${table}"
      all_ok=false
    else
      log_info "  ${table}: ${count}건"
    fi
  done

  if [[ "${all_ok}" == true ]]; then
    log_info "복원 검증 통과"
  else
    log_warn "일부 테이블 검증 실패 — 데이터를 직접 확인하세요."
  fi
}

# ── 클린업 ────────────────────────────────────────────────────────────────────
cleanup() {
  rm -f "${TEMP_DUMP}" 2>/dev/null || true
}

trap cleanup EXIT

# ── 메인 ─────────────────────────────────────────────────────────────────────
main() {
  # --help는 디렉토리 생성 전에 처리
  for _a in "$@"; do [[ "$_a" == "--help" ]] && usage; done

  mkdir -p "${BACKUP_LOG_DIR}"

  parse_args "$@"

  log_info "================================================================"
  log_info "PG System 데이터베이스 복원 시작"
  log_info "  백업 파일: $(basename "${BACKUP_FILE}")"
  if [[ -n "${TARGET_TABLE}" ]]; then
    log_info "  대상 테이블: ${TARGET_TABLE}"
  fi
  log_info "================================================================"

  log_warn "!!! 경고: 이 작업은 기존 데이터를 덮어씁니다 !!!"
  log_warn "복원 대상: ${DB_HOST}:${DB_PORT}/${DB_NAME}"

  # 비대화형 환경에서는 자동 진행, 터미널에서는 확인 요청
  if [[ -t 0 ]]; then
    read -r -p "계속하시겠습니까? (yes 입력): " confirm
    if [[ "${confirm}" != "yes" ]]; then
      log_info "사용자가 복원을 취소했습니다."
      exit 0
    fi
  fi

  validate_env
  check_db_connection
  verify_checksum
  save_snapshot
  decrypt_backup
  run_restore
  verify_restore

  log_info "================================================================"
  log_info "복원 완료"
  log_info "  로그: ${LOG_FILE}"
  log_info "================================================================"
  exit 0
}

main "$@"
