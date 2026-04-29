/**
 * PCI DSS 6.4.3 스크립트 인벤토리 관리
 *
 * 결제 페이지에서 실행되는 모든 스크립트를 추적·관리하기 위한 타입.
 * 비유: "건물 출입 명부" — 허가된 스크립트만 목록에 등록하고,
 *       등록되지 않은 스크립트는 차단한다.
 */

/** 개별 스크립트 등록 항목 */
export interface ScriptInventoryEntry {
  /** 스크립트 식별자 (예: "analytics-v2") */
  readonly name: string;
  /** 스크립트 URL 또는 경로 */
  readonly src: string;
  /** sha384 SRI 해시 */
  readonly sriHash: string;
  /** 사용 목적 (예: "결제 UI 렌더링") */
  readonly purpose: string;
  /** 추가한 사람 */
  readonly addedBy: string;
  /** 추가 일시 (ISO 8601) */
  readonly addedAt: string;
  /** 마지막 검증일 (ISO 8601) */
  readonly lastVerified: string;
}

/** 스크립트 인벤토리 전체 */
export interface ScriptInventory {
  /** 인벤토리 버전 */
  readonly version: string;
  /** 마지막 업데이트 일시 (ISO 8601) */
  readonly lastUpdated: string;
  /** 등록된 스크립트 목록 */
  readonly entries: readonly ScriptInventoryEntry[];
}
