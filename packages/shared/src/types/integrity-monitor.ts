// ============================================================
// PG System — 파일 무결성 모니터링(FIM) 타입 정의
// PCI DSS 11.6.1 준수: 결제 페이지/스크립트 변경 탐지
// ============================================================

/** 단일 파일의 해시 기록 */
export interface FileHashRecord {
  readonly filePath: string;
  readonly algorithm: 'sha256';
  readonly hash: string;
  readonly fileSize: number;
  readonly lastModified: string; // ISO 8601
  readonly checkedAt: string; // ISO 8601
}

/** 무결성 검사 최종 결과 */
export interface IntegrityCheckResult {
  readonly status: 'PASS' | 'FAIL' | 'ERROR';
  readonly checkedAt: string;
  readonly totalFiles: number;
  readonly changedFiles: readonly FileChangeDetail[];
  readonly newFiles: readonly string[];
  readonly deletedFiles: readonly string[];
}

/** 변경이 감지된 파일 상세 */
export interface FileChangeDetail {
  readonly filePath: string;
  readonly previousHash: string;
  readonly currentHash: string;
  readonly changeDetectedAt: string;
}

/** 무결성 위반 심각도 (CRITICAL: 결제 핵심, HIGH: 빌드 산출물, MEDIUM: 설정) */
export type IntegritySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
