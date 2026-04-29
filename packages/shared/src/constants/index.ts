// ============================================================
// PG System — 공유 상수 (OST 원칙: 한 곳에서 정의)
// ============================================================

// ---- 에러 코드 ----
export const ERROR_CODES = {
  // 인증 (AUTH)
  AUTH_001: "AUTH_001", // 인증이 필요합니다
  AUTH_002: "AUTH_002", // 아이디 또는 비밀번호가 올바르지 않습니다
  AUTH_003: "AUTH_003", // 계정이 잠겼습니다
  AUTH_004: "AUTH_004", // MFA 인증이 필요합니다
  AUTH_005: "AUTH_005", // MFA 코드가 올바르지 않습니다
  AUTH_006: "AUTH_006", // 토큰이 만료되었습니다
  AUTH_007: "AUTH_007", // 비밀번호가 정책을 위반합니다 (최소 12자)
  AUTH_008: "AUTH_008", // 권한이 없습니다

  // 사용자 (USER)
  USER_001: "USER_001", // 사용자를 찾을 수 없습니다
  USER_002: "USER_002", // 이미 존재하는 로그인 ID입니다
  USER_003: "USER_003", // 잘못된 사용자 유형입니다

  // 대리점 (AGENT)
  AGENT_001: "AGENT_001", // 대리점을 찾을 수 없습니다
  AGENT_002: "AGENT_002", // 이미 존재하는 대리점 코드입니다
  AGENT_003: "AGENT_003", // 상위 대리점이 활성 상태가 아닙니다
  AGENT_004: "AGENT_004", // 하위 대리점이 있어 삭제할 수 없습니다
  AGENT_005: "AGENT_005", // 연결된 가맹점이 있어 삭제할 수 없습니다

  // 가맹점 (MERCHANT)
  MERCHANT_001: "MERCHANT_001", // 가맹점을 찾을 수 없습니다
  MERCHANT_002: "MERCHANT_002", // 이미 존재하는 가맹점 코드입니다
  MERCHANT_003: "MERCHANT_003", // 가맹점이 활성 상태가 아닙니다

  // 거래 (TRANSACTION)
  TXN_001: "TXN_001", // 거래를 찾을 수 없습니다
  TXN_002: "TXN_002", // 거래 금액이 올바르지 않습니다
  TXN_003: "TXN_003", // 이미 취소된 거래입니다
  TXN_004: "TXN_004", // 취소 금액이 원거래 금액을 초과합니다

  // 정산 (SETTLEMENT)
  STL_001: "STL_001", // 정산 데이터를 찾을 수 없습니다
  STL_002: "STL_002", // 이미 확정된 정산입니다
  STL_003: "STL_003", // 수수료 계층 검증 실패 (PG마진 ≤ 대리점 ≤ 가맹점)

  // 역할 (ROLE)
  ROLE_001: "ROLE_001", // 역할을 찾을 수 없습니다
  ROLE_002: "ROLE_002", // 이미 존재하는 역할 이름입니다
  ROLE_003: "ROLE_003", // 사용 중인 역할은 삭제할 수 없습니다

  // 리스크 (RISK)
  RISK_001: "RISK_001", // 리스크 알림을 찾을 수 없습니다

  // 시스템 코드 (SYSTEM)
  SYS_001: "SYS_001", // 시스템 코드를 찾을 수 없습니다
  SYS_002: "SYS_002", // 이미 존재하는 시스템 코드입니다

  // 입금/대사 (DEPOSIT)
  DEPOSIT_001: "DEPOSIT_001", // 입금 데이터를 찾을 수 없습니다
  DEPOSIT_002: "DEPOSIT_002", // 이미 대사 처리된 입금입니다
  DEPOSIT_003: "DEPOSIT_003", // 대사 금액이 일치하지 않습니다

  // 결제 게이트웨이 (PGW)
  PGW_001: "PGW_001", // 유효하지 않은 API 키
  PGW_002: "PGW_002", // 결제 금액 불일치
  PGW_003: "PGW_003", // 이미 승인된 결제
  PGW_004: "PGW_004", // 결제 시간 초과
  PGW_005: "PGW_005", // 카드사 거절
  PGW_006: "PGW_006", // 웹훅 전송 실패
  PGW_007: "PGW_007", // 취소 금액 초과
  PGW_008: "PGW_008", // 가상계좌 입금 대기 만료 또는 주문 불일치

  // Mock 카드사 (ACQUIRER)
  ACQ_001: "ACQ_001", // 카드사 거절
  ACQ_002: "ACQ_002", // 카드사 타임아웃
  ACQ_003: "ACQ_003", // 잔액 부족
  ACQ_004: "ACQ_004", // 은행 이체 실패

  // 정산 추가 (SETTLEMENT)
  STL_004: "STL_004", // 정산 배치 실행 실패

  // 이상거래탐지 (FDS)
  FDS_001: "FDS_001", // 이상거래가 탐지되어 결제가 차단되었습니다
  FDS_002: "FDS_002", // 이상거래 경고 (결제 진행, 알림 발생)

  // IP 화이트리스트 (PGW)
  PGW_IP_BLOCKED: "PGW_IP_BLOCKED", // 허용되지 않은 IP 주소에서의 접근

  // 공통 (COMMON)
  VALIDATION_001: "VALIDATION_001", // 입력값 검증 실패
  NOT_FOUND: "NOT_FOUND", // 리소스를 찾을 수 없습니다
  INTERNAL_ERROR: "INTERNAL_ERROR", // 내부 서버 오류
  RATE_LIMIT: "RATE_LIMIT", // 요청 한도 초과
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---- 역할 ----
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SETTLEMENT_ADMIN: "SETTLEMENT_ADMIN",
  OPERATION_ADMIN: "OPERATION_ADMIN",
  READ_ONLY_ADMIN: "READ_ONLY_ADMIN",
  AGENT_OWNER: "AGENT_OWNER",
  AGENT_STAFF: "AGENT_STAFF",
  MERCHANT_OWNER: "MERCHANT_OWNER",
  MERCHANT_STAFF: "MERCHANT_STAFF",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

// ---- 권한 코드 ----
export const PERMISSIONS = {
  USER_CREATE: "user:create",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",
  AGENT_CREATE: "agent:create",
  AGENT_READ: "agent:read",
  AGENT_UPDATE: "agent:update",
  AGENT_DELETE: "agent:delete",
  MERCHANT_CREATE: "merchant:create",
  MERCHANT_READ: "merchant:read",
  MERCHANT_UPDATE: "merchant:update",
  MERCHANT_DELETE: "merchant:delete",
  TRANSACTION_CREATE: "transaction:create",
  TRANSACTION_READ: "transaction:read",
  TRANSACTION_CANCEL: "transaction:cancel",
  SETTLEMENT_READ: "settlement:read",
  SETTLEMENT_CONFIRM: "settlement:confirm",
  COMMISSION_READ: "commission:read",
  COMMISSION_UPDATE: "commission:update",
  DEPOSIT_CREATE: "deposit:create",
  DEPOSIT_READ: "deposit:read",
  DEPOSIT_CONFIRM: "deposit:confirm",
  DEPOSIT_RECONCILE: "deposit:reconcile",
  AUDIT_READ: "audit:read",
  RISK_READ: "risk:read",
  RISK_MANAGE: "risk:manage",
  SYSTEM_MANAGE: "system:manage",
  DASHBOARD_READ: "dashboard:read",
  PG_API_MANAGE: "pg:api:manage",
  PG_WEBHOOK_MANAGE: "pg:webhook:manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ---- 사용자 유형 ----
export const USER_TYPES = {
  ADMIN: "ADMIN",
  AGENT: "AGENT",
  MERCHANT: "MERCHANT",
} as const;

// ---- 상태값 ----
export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  LOCKED: "LOCKED",
  DORMANT: "DORMANT",
  WITHDRAWN: "WITHDRAWN",
} as const;

export const TRANSACTION_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const SETTLEMENT_STATUS = {
  CALCULATED: "CALCULATED",
  CONFIRMED: "CONFIRMED",
  REMITTED: "REMITTED",
  COMPLETED: "COMPLETED",
} as const;

export const AGENT_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  TERMINATED: "TERMINATED",
} as const;

export type AgentStatusCode = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export const MERCHANT_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  TERMINATED: "TERMINATED",
} as const;

export type MerchantStatusCode =
  (typeof MERCHANT_STATUS)[keyof typeof MERCHANT_STATUS];

export const SETTLEMENT_CYCLES = {
  D1: "D+1",
  D2: "D+2",
  D3: "D+3",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;

export type SettlementCycleCode =
  (typeof SETTLEMENT_CYCLES)[keyof typeof SETTLEMENT_CYCLES];

// ---- FDS 룰 임계값 ----
export const FDS_RULES = {
  /** 단건 결제 차단 한도 (5,000,000원 초과 시 BLOCK) */
  SINGLE_TXN_LIMIT: 5_000_000,
  /** 1시간 누적 결제 차단 한도 (10,000,000원 초과 시 BLOCK) */
  HOURLY_MERCHANT_LIMIT: 10_000_000,
  /** 1시간 내 동일 카드 결제 횟수 한도 (5회 초과 시 BLOCK) */
  HOURLY_CARD_COUNT_LIMIT: 5,
  /** 심야 시간대 고액 결제 경고 한도 (1,000,000원 초과 시 WARN) */
  NIGHT_HIGH_AMOUNT: 1_000_000,
  /** 심야 시작 시각 (23시 이상) */
  NIGHT_START_HOUR: 23,
  /** 심야 종료 시각 (5시 미만) */
  NIGHT_END_HOUR: 5,
  /** 연속 거절 카운트 한도 (30분 내 ABORTED 3회 이상 → BLOCK) */
  CONSECUTIVE_FAIL_LIMIT: 3,
  /** 연속 거절 집계 윈도우 (30분) */
  CONSECUTIVE_FAIL_WINDOW_MS: 30 * 60 * 1000,
} as const;

// ---- 보안 상수 ----
export const SECURITY = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_DURATION_MINUTES: 30,
  PASSWORD_MIN_LENGTH: 12,
  ACCESS_TOKEN_EXPIRES_SECONDS: 900, // 15분
  REFRESH_TOKEN_EXPIRES_DAYS: 7,
  PAYMENT_RATE_LIMIT_PER_MINUTE: 10,
  LOGIN_RATE_LIMIT_PER_MINUTE: 5,
} as const;

// ---- 페이지네이션 기본값 ----
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ---- 카드사 코드 ----
export const CARD_COMPANIES = {
  SHINHAN: "SHINHAN",
  KB: "KB",
  HYUNDAI: "HYUNDAI",
  SAMSUNG: "SAMSUNG",
  LOTTE: "LOTTE",
  BC: "BC",
  HANA: "HANA",
  WOORI: "WOORI",
  NH: "NH",
  CITI: "CITI",
} as const;

export type CardCompany = (typeof CARD_COMPANIES)[keyof typeof CARD_COMPANIES];

// ---- 대사 상태 ----
export const RECONCILE_STATUS = {
  PENDING: "PENDING",
  MATCHED: "MATCHED",
  MISMATCHED: "MISMATCHED",
  MANUAL: "MANUAL",
} as const;

export type ReconcileStatusCode =
  (typeof RECONCILE_STATUS)[keyof typeof RECONCILE_STATUS];

// ---- 거래 유형 ----
export const TRANSACTION_TYPES = {
  PAYMENT: "PAYMENT",
  CANCEL: "CANCEL",
  PARTIAL_CANCEL: "PARTIAL_CANCEL",
} as const;

export type TransactionTypeCode =
  (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

// ---- 결제 수단 ----
export const PAYMENT_METHODS = {
  CARD: "CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  VIRTUAL_ACCOUNT: "VIRTUAL_ACCOUNT",
  CASH: "CASH",
} as const;

export type PaymentMethodCode =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

// ---- PG 게이트웨이 결제 상태 ----
export const PG_PAYMENT_STATUS = {
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELED: "CANCELED",
  PARTIAL_CANCELED: "PARTIAL_CANCELED",
  ABORTED: "ABORTED",
  EXPIRED: "EXPIRED",
  WAITING_FOR_DEPOSIT: "WAITING_FOR_DEPOSIT",
} as const;

export type PgPaymentStatusCode =
  (typeof PG_PAYMENT_STATUS)[keyof typeof PG_PAYMENT_STATUS];

// ---- 웹훅 이벤트 타입 ----
export const WEBHOOK_EVENT_TYPES = {
  PAYMENT_STATUS_CHANGED: "PAYMENT_STATUS_CHANGED",
  DEPOSIT_CALLBACK: "DEPOSIT_CALLBACK",
  FDS_ALERT: "FDS_ALERT",
} as const;

export type WebhookEventType =
  (typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES];

// ---- 웹훅 전송 상태 ----
export const WEBHOOK_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;

export type WebhookStatusCode =
  (typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];

// ---- 감사 로그 액션 코드 (PCI DSS 10.2) ----
export const AUDIT_ACTIONS = {
  // PG 결제 이벤트
  PG_PAYMENT_CONFIRM: "PG_PAYMENT_CONFIRM",
  PG_PAYMENT_CANCEL: "PG_PAYMENT_CANCEL",
  PG_PAYMENT_PARTIAL_CANCEL: "PG_PAYMENT_PARTIAL_CANCEL",
  PG_VIRTUAL_ACCOUNT_ISSUED: "PG_VIRTUAL_ACCOUNT_ISSUED",
  PG_VIRTUAL_ACCOUNT_DEPOSITED: "PG_VIRTUAL_ACCOUNT_DEPOSITED",
  PG_FDS_ALERT: "PG_FDS_ALERT",
  // 키 로테이션 이벤트 (PCI DSS 3.6.1)
  KEY_ROTATION_START: "KEY_ROTATION_START",
  KEY_ROTATION_COMPLETE: "KEY_ROTATION_COMPLETE",
  KEY_ROTATION_FAILED: "KEY_ROTATION_FAILED",
  // 접근 제어 이벤트
  IP_WHITELIST_BLOCKED: "IP_WHITELIST_BLOCKED",
  // 정산 배치
  SETTLEMENT_BATCH: "SETTLEMENT_BATCH",
  // 정산 자동 실행 이벤트
  SETTLEMENT_CONFIRMED: "SETTLEMENT_CONFIRMED",
  SETTLEMENT_REMITTED: "SETTLEMENT_REMITTED",
  SETTLEMENT_COMPLETED: "SETTLEMENT_COMPLETED",
  // CUD 감사 로그 — 모듈별 생성/수정/삭제 (PCI DSS 10.2.2)
  MERCHANT_CREATE: "MERCHANT_CREATE",
  MERCHANT_UPDATE: "MERCHANT_UPDATE",
  MERCHANT_DELETE: "MERCHANT_DELETE",
  AGENT_CREATE: "AGENT_CREATE",
  AGENT_UPDATE: "AGENT_UPDATE",
  AGENT_DELETE: "AGENT_DELETE",
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  TRANSACTION_CANCEL: "TRANSACTION_CANCEL",
  DEPOSIT_CREATE: "DEPOSIT_CREATE",
  DEPOSIT_UPDATE: "DEPOSIT_UPDATE",
  SETTLEMENT_CREATE: "SETTLEMENT_CREATE",
  SETTLEMENT_UPDATE: "SETTLEMENT_UPDATE",
  COMMISSION_CREATE: "COMMISSION_CREATE",
  COMMISSION_UPDATE: "COMMISSION_UPDATE",
  COMMISSION_DELETE: "COMMISSION_DELETE",
  SYSTEM_CODE_CREATE: "SYSTEM_CODE_CREATE",
  SYSTEM_CODE_UPDATE: "SYSTEM_CODE_UPDATE",
  SYSTEM_CODE_DELETE: "SYSTEM_CODE_DELETE",
  NOTIFICATION_CREATE: "NOTIFICATION_CREATE",
  // 상태 변경 이벤트
  MERCHANT_STATUS_CHANGE: "MERCHANT_STATUS_CHANGE",
  AGENT_STATUS_CHANGE: "AGENT_STATUS_CHANGE",
  // 사용자 추가 이벤트
  USER_PROFILE_UPDATE: "USER_PROFILE_UPDATE",
  USER_ASSIGN_ROLES: "USER_ASSIGN_ROLES",
  // 역할/권한 이벤트 (RBAC)
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_UPDATE: "ROLE_UPDATE",
  ROLE_DELETE: "ROLE_DELETE",
  ROLE_ASSIGN_PERMISSIONS: "ROLE_ASSIGN_PERMISSIONS",
  // 거래 생성 이벤트
  TRANSACTION_CREATE: "TRANSACTION_CREATE",
  // 입금 대사 이벤트
  DEPOSIT_RECONCILE: "DEPOSIT_RECONCILE",
  DEPOSIT_MANUAL_MATCH: "DEPOSIT_MANUAL_MATCH",
  DEPOSIT_UNMATCH: "DEPOSIT_UNMATCH",
} as const;

export type AuditActionCode =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ---- 캐시 TTL (밀리초 단위) ----
export const CACHE_TTL = {
  /** 카드 BIN 조회 — 거의 변경 안 됨 (24시간) */
  CARD_BIN: 24 * 60 * 60 * 1000,
  /** 수수료율 조회 — 결제 핫패스, 관리자 변경 시 무효화 (4시간) */
  FEE_RATE: 4 * 60 * 60 * 1000,
  /** API 키 검증 — 매 요청마다 호출 (1시간) */
  API_KEY_PREFIX: 60 * 60 * 1000,
  /** 시스템 코드 — 관리자 UI, 거의 변경 안 됨 (24시간) */
  SYSTEM_CODES: 24 * 60 * 60 * 1000,
  /** 메뉴 트리 — 거의 변경 안 됨 (24시간) */
  MENU_TREE: 24 * 60 * 60 * 1000,
  /** 공휴일 — 연 1회 변경 (7일) */
  HOLIDAYS: 7 * 24 * 60 * 60 * 1000,
  /** 알림 — 자주 변경됨 (5분) */
  NOTIFICATIONS: 5 * 60 * 1000,
  /** 수수료 설정 — 관리자 변경 시 무효화 (2시간) */
  COMMISSIONS: 2 * 60 * 60 * 1000,
  /** 사용자 권한/역할 — Access Token 만료와 동일 (15분) */
  USER_PERMISSIONS: 15 * 60 * 1000,
  /** 글로벌 기본 TTL (5분) */
  DEFAULT: 5 * 60 * 1000,
} as const;
