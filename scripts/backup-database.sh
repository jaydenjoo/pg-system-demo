#!/usr/bin/env bash
# backup-database.sh — PG System PostgreSQL 백업 스크립트
# PCI DSS 12.3.1 / 전자금융감독규정 데이터 보호 요건 준수
#
# 사용법:
#   ./scripts/backup-database.sh              # 일반 백업
#   ./scripts/backup-database.sh --dry-run    # 설정 확인만 (실제 실행 없음)
#   ./scripts/backup-database.sh --s3         # S3 업로드 포함
#   ./scripts/backup-database.sh --help       # 도움말

set -euo pipefail

# ── 상수 ──────────────────────────────────────────────────────────────────────
SCRIPT_NAME="$(basename "$0")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DATE_STR="$(date +%Y%m%d)"

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backups}"
BACKUP_DAILY_DIR="${BACKUP_BASE_DIR}/daily"
BACKUP_LOG_DIR="${BACKUP_BASE_DIR}/logs"
BACKUP_FILE="${BACKUP_DAILY_DIR}/pg_system_${TIMESTAMP}.dump"
BACKUP_ENC_FILE="${BACKUP_FILE}.enc"
BACKUP_SHA_FILE="${BACKUP_ENC_FILE}.sha256"
LOG_FILE="${BACKUP_LOG_DIR}/backup_${DATE_STR}.log"

# ── 환경변수 기본값 ────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-pgdb}"
DB_USER="${DB_USER:-pgadmin}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ── 플래그 ────────────────────────────────────────────────────────────────────
DRY_RUN=false
UPLOAD_S3=false

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
사용법: ${SCRIPT_NAME} [옵션]

옵션:
  --dry-run    실제 백업 없이 설정과 연결만 확인
  --s3         백업 완료 후 S3에 업로드 (BACKUP_S3_BUCKET 필요)
  --help       이 도움말 출력

필수 환경변수:
  DB_HOST              데이터베이스 호스트 (기본: db)
  DB_PORT              데이터베이스 포트 (기본: 5432)
  DB_NAME              데이터베이스 이름 (기본: pgdb)
  DB_USER              데이터베이스 사용자 (기본: pgadmin)
  PGPASSWORD           데이터베이스 비밀번호 (필수)
  BACKUP_ENCRYPTION_KEY 백업 파일 AES-256 암호화 키 (필수)

선택 환경변수:
  BACKUP_RETENTION_DAYS  백업 보관 일수 (기본: 30)
  BACKUP_S3_BUCKET       S3 버킷명 (--s3 옵션 사용 시 필수)
  SLACK_WEBHOOK_URL      Slack 알림 웹훅 URL
  BACKUP_BASE_DIR        백업 저장 기본 경로 (기본: /backups)

예시:
  BACKUP_ENCRYPTION_KEY=mykey PGPASSWORD=dbpass ./scripts/backup-database.sh
  ./scripts/backup-database.sh --dry-run
  ./scripts/backup-database.sh --s3
EOF
  exit 0
}

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --help)    usage ;;
    --dry-run) DRY_RUN=true ;;
    --s3)      UPLOAD_S3=true ;;
    *)
      echo "[오류] 알 수 없는 옵션: ${arg}" >&2
      echo "사용법: ${SCRIPT_NAME} --help" >&2
      exit 1
      ;;
  esac
done

# ── 로그 함수 ─────────────────────────────────────────────────────────────────
log() {
  local level="$1"
  local msg="$2"
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${msg}"
  echo "${line}"
  # 로그 파일이 초기화된 후에만 파일에도 기록
  if [[ -d "${BACKUP_LOG_DIR}" ]]; then
    echo "${line}" >> "${LOG_FILE}"
  fi
}

log_info()  { log "INFO " "$1"; }
log_warn()  { log "WARN " "$1"; }
log_error() { log "ERROR" "$1"; }

# ── 실패 알림 ─────────────────────────────────────────────────────────────────
notify_failure() {
  local reason="$1"
  log_error "백업 실패: ${reason}"

  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local payload
    payload=$(cat <<JSON
{
  "text": ":x: *PG System 백업 실패*",
  "attachments": [{
    "color": "danger",
    "fields": [
      {"title": "호스트", "value": "${DB_HOST}", "short": true},
      {"title": "DB", "value": "${DB_NAME}", "short": true},
      {"title": "시각", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true},
      {"title": "원인", "value": "${reason}", "short": false}
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
      --silent \
      --show-error \
      -o /dev/null || log_warn "Slack 알림 전송 실패 (무시)"
  fi
}

# ── 성공 알림 ─────────────────────────────────────────────────────────────────
notify_success() {
  local size="$1"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local payload
    payload=$(cat <<JSON
{
  "text": ":white_check_mark: *PG System 백업 완료*",
  "attachments": [{
    "color": "good",
    "fields": [
      {"title": "DB", "value": "${DB_NAME}", "short": true},
      {"title": "파일 크기", "value": "${size}", "short": true},
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
      -o /dev/null || log_warn "Slack 알림 전송 실패 (무시)"
  fi
}

# ── 사전 검증 ─────────────────────────────────────────────────────────────────
validate_env() {
  log_info "환경변수 검증 중..."

  if [[ -z "${PGPASSWORD:-}" ]]; then
    log_error "PGPASSWORD 환경변수가 설정되지 않았습니다."
    exit 2
  fi

  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    log_error "BACKUP_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다."
    exit 2
  fi

  if [[ "${UPLOAD_S3}" == true && -z "${BACKUP_S3_BUCKET:-}" ]]; then
    log_error "--s3 옵션 사용 시 BACKUP_S3_BUCKET 환경변수가 필요합니다."
    exit 2
  fi

  # 필요 도구 확인
  for tool in pg_dump openssl sha256sum; do
    if ! command -v "${tool}" &>/dev/null; then
      log_error "필요 도구 없음: ${tool}"
      exit 3
    fi
  done

  if [[ "${UPLOAD_S3}" == true ]]; then
    if ! command -v aws &>/dev/null; then
      log_error "S3 업로드에 aws cli가 필요합니다."
      exit 3
    fi
  fi

  log_info "환경변수 검증 완료"
}

# ── DB 연결 확인 ──────────────────────────────────────────────────────────────
check_db_connection() {
  log_info "DB 연결 확인 중 (${DB_HOST}:${DB_PORT}/${DB_NAME})..."
  if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -q; then
    notify_failure "DB 연결 실패 (${DB_HOST}:${DB_PORT}/${DB_NAME})"
    exit 4
  fi
  log_info "DB 연결 정상"
}

# ── 디렉토리 초기화 ───────────────────────────────────────────────────────────
init_dirs() {
  mkdir -p "${BACKUP_DAILY_DIR}" "${BACKUP_LOG_DIR}"
  log_info "백업 디렉토리 준비: ${BACKUP_DAILY_DIR}"
}

# ── pg_dump 실행 ──────────────────────────────────────────────────────────────
run_dump() {
  log_info "pg_dump 시작..."
  if ! pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=custom \
    --compress=9 \
    --no-password \
    --file="${BACKUP_FILE}"; then
    notify_failure "pg_dump 실패"
    rm -f "${BACKUP_FILE}"
    exit 5
  fi

  local dump_size
  dump_size="$(du -sh "${BACKUP_FILE}" | cut -f1)"
  log_info "pg_dump 완료: ${BACKUP_FILE} (${dump_size})"
}

# ── AES-256 암호화 ────────────────────────────────────────────────────────────
encrypt_backup() {
  log_info "AES-256-CBC 암호화 중..."
  if ! openssl enc -aes-256-cbc \
    -salt \
    -pbkdf2 \
    -iter 100000 \
    -pass "env:BACKUP_ENCRYPTION_KEY" \
    -in "${BACKUP_FILE}" \
    -out "${BACKUP_ENC_FILE}"; then
    notify_failure "암호화 실패"
    rm -f "${BACKUP_FILE}" "${BACKUP_ENC_FILE}"
    exit 6
  fi

  # 원본 dump 파일 제거 (암호화 파일만 보관)
  rm -f "${BACKUP_FILE}"
  log_info "암호화 완료: ${BACKUP_ENC_FILE}"
}

# ── SHA-256 체크섬 ────────────────────────────────────────────────────────────
generate_checksum() {
  log_info "SHA-256 체크섬 생성 중..."
  sha256sum "${BACKUP_ENC_FILE}" > "${BACKUP_SHA_FILE}"
  log_info "체크섬 저장: ${BACKUP_SHA_FILE}"
}

# ── S3 업로드 ─────────────────────────────────────────────────────────────────
upload_to_s3() {
  if [[ "${UPLOAD_S3}" != true ]]; then
    return 0
  fi

  local s3_prefix="s3://${BACKUP_S3_BUCKET}/pg-system/backups/daily"
  log_info "S3 업로드 중: ${s3_prefix}/"

  if ! aws s3 cp "${BACKUP_ENC_FILE}" "${s3_prefix}/$(basename "${BACKUP_ENC_FILE}")" \
    --sse aws:kms \
    --storage-class STANDARD_IA; then
    log_warn "S3 업로드 실패 (로컬 백업은 유지됨)"
    return 0
  fi

  aws s3 cp "${BACKUP_SHA_FILE}" "${s3_prefix}/$(basename "${BACKUP_SHA_FILE}")" \
    --sse aws:kms || true

  log_info "S3 업로드 완료"
}

# ── 오래된 백업 삭제 ──────────────────────────────────────────────────────────
cleanup_old_backups() {
  log_info "오래된 백업 정리 중 (보관 기간: ${BACKUP_RETENTION_DAYS}일)..."
  local count=0
  while IFS= read -r -d '' old_file; do
    rm -f "${old_file}" "${old_file}.sha256"
    log_info "삭제: $(basename "${old_file}")"
    ((count++)) || true
  done < <(find "${BACKUP_DAILY_DIR}" \
    -name "pg_system_*.dump.enc" \
    -mtime "+${BACKUP_RETENTION_DAYS}" \
    -print0)

  if [[ ${count} -gt 0 ]]; then
    log_info "총 ${count}개 오래된 백업 삭제 완료"
  else
    log_info "삭제할 오래된 백업 없음"
  fi
}

# ── dry-run 모드 ──────────────────────────────────────────────────────────────
run_dry_run() {
  log_info "=== DRY-RUN 모드 ==="
  log_info "DB 호스트:   ${DB_HOST}:${DB_PORT}"
  log_info "DB 이름:     ${DB_NAME}"
  log_info "DB 사용자:   ${DB_USER}"
  log_info "백업 경로:   ${BACKUP_DAILY_DIR}"
  log_info "보관 기간:   ${BACKUP_RETENTION_DAYS}일"
  log_info "S3 업로드:   ${UPLOAD_S3}"
  if [[ "${UPLOAD_S3}" == true ]]; then
    log_info "S3 버킷:     ${BACKUP_S3_BUCKET:-미설정}"
  fi
  log_info "암호화 키:   [설정됨 — 값 비표시]"
  log_info "Slack 알림:  $([[ -n "${SLACK_WEBHOOK_URL:-}" ]] && echo '활성' || echo '비활성')"
  log_info ""
  check_db_connection
  log_info "=== DRY-RUN 완료 — 실제 백업은 수행되지 않음 ==="
  exit 0
}

# ── 메인 ─────────────────────────────────────────────────────────────────────
main() {
  log_info "================================================================"
  log_info "PG System 데이터베이스 백업 시작"
  log_info "================================================================"

  validate_env

  if [[ "${DRY_RUN}" == true ]]; then
    run_dry_run
  fi

  init_dirs
  check_db_connection
  run_dump
  encrypt_backup
  generate_checksum
  upload_to_s3
  cleanup_old_backups

  local final_size
  final_size="$(du -sh "${BACKUP_ENC_FILE}" | cut -f1)"

  log_info "================================================================"
  log_info "백업 완료"
  log_info "  파일: $(basename "${BACKUP_ENC_FILE}")"
  log_info "  크기: ${final_size}"
  log_info "================================================================"

  notify_success "${final_size}"
  exit 0
}

main "$@"
