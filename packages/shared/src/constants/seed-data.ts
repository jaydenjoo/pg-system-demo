// ============================================================
// PG System — 시드 데이터 상수 (OST 원칙: 한 곳에서 정의)
// seed.ts, 테스트, 관리 도구에서 공통 사용
// ============================================================

import { PERMISSIONS, ROLES, USER_TYPES } from './index';

// ---- 권한 정의 (28개) ----
export interface PermissionDef {
  readonly code: string;
  readonly name: string;
  readonly resource: string;
  readonly action: string;
}

export const PERMISSION_DEFS: readonly PermissionDef[] = [
  { code: PERMISSIONS.USER_CREATE,        name: '사용자 생성',   resource: 'user',        action: 'create'    },
  { code: PERMISSIONS.USER_READ,          name: '사용자 조회',   resource: 'user',        action: 'read'      },
  { code: PERMISSIONS.USER_UPDATE,        name: '사용자 수정',   resource: 'user',        action: 'update'    },
  { code: PERMISSIONS.USER_DELETE,        name: '사용자 삭제',   resource: 'user',        action: 'delete'    },
  { code: PERMISSIONS.AGENT_CREATE,       name: '대리점 생성',   resource: 'agent',       action: 'create'    },
  { code: PERMISSIONS.AGENT_READ,         name: '대리점 조회',   resource: 'agent',       action: 'read'      },
  { code: PERMISSIONS.AGENT_UPDATE,       name: '대리점 수정',   resource: 'agent',       action: 'update'    },
  { code: PERMISSIONS.AGENT_DELETE,       name: '대리점 삭제',   resource: 'agent',       action: 'delete'    },
  { code: PERMISSIONS.MERCHANT_CREATE,    name: '가맹점 생성',   resource: 'merchant',    action: 'create'    },
  { code: PERMISSIONS.MERCHANT_READ,      name: '가맹점 조회',   resource: 'merchant',    action: 'read'      },
  { code: PERMISSIONS.MERCHANT_UPDATE,    name: '가맹점 수정',   resource: 'merchant',    action: 'update'    },
  { code: PERMISSIONS.MERCHANT_DELETE,    name: '가맹점 삭제',   resource: 'merchant',    action: 'delete'    },
  { code: PERMISSIONS.TRANSACTION_CREATE, name: '거래 생성',     resource: 'transaction', action: 'create'    },
  { code: PERMISSIONS.TRANSACTION_READ,   name: '거래 조회',     resource: 'transaction', action: 'read'      },
  { code: PERMISSIONS.TRANSACTION_CANCEL, name: '거래 취소',     resource: 'transaction', action: 'cancel'    },
  { code: PERMISSIONS.SETTLEMENT_READ,    name: '정산 조회',     resource: 'settlement',  action: 'read'      },
  { code: PERMISSIONS.SETTLEMENT_CONFIRM, name: '정산 확정',     resource: 'settlement',  action: 'confirm'   },
  { code: PERMISSIONS.COMMISSION_READ,    name: '수수료 조회',   resource: 'commission',  action: 'read'      },
  { code: PERMISSIONS.COMMISSION_UPDATE,  name: '수수료 수정',   resource: 'commission',  action: 'update'    },
  { code: PERMISSIONS.DEPOSIT_CREATE,     name: '입금 등록',     resource: 'deposit',     action: 'create'    },
  { code: PERMISSIONS.DEPOSIT_READ,       name: '입금 조회',     resource: 'deposit',     action: 'read'      },
  { code: PERMISSIONS.DEPOSIT_CONFIRM,    name: '입금 확인',     resource: 'deposit',     action: 'confirm'   },
  { code: PERMISSIONS.DEPOSIT_RECONCILE,  name: '입금 대사',     resource: 'deposit',     action: 'reconcile' },
  { code: PERMISSIONS.AUDIT_READ,         name: '감사로그 조회', resource: 'audit',       action: 'read'      },
  { code: PERMISSIONS.RISK_READ,          name: '리스크 조회',   resource: 'risk',        action: 'read'      },
  { code: PERMISSIONS.RISK_MANAGE,        name: '리스크 관리',   resource: 'risk',        action: 'manage'    },
  { code: PERMISSIONS.SYSTEM_MANAGE,      name: '시스템 관리',   resource: 'system',      action: 'manage'    },
  { code: PERMISSIONS.DASHBOARD_READ,     name: '대시보드 조회', resource: 'dashboard',   action: 'read'      },
] as const;

// ---- 역할 정의 (8개) ----
export interface RoleDef {
  readonly name: string;
  readonly description: string;
  readonly userType: string;
}

export const ROLE_DEFS: readonly RoleDef[] = [
  { name: ROLES.SUPER_ADMIN,      description: '최고 관리자 — 모든 권한',              userType: USER_TYPES.ADMIN    },
  { name: ROLES.SETTLEMENT_ADMIN, description: '정산 관리자 — 정산/입금 전담',          userType: USER_TYPES.ADMIN    },
  { name: ROLES.OPERATION_ADMIN,  description: '운영 관리자 — 거래/가맹점/리스크 관리', userType: USER_TYPES.ADMIN    },
  { name: ROLES.READ_ONLY_ADMIN,  description: '읽기 전용 관리자',                     userType: USER_TYPES.ADMIN    },
  { name: ROLES.AGENT_OWNER,      description: '대리점 대표',                          userType: USER_TYPES.AGENT    },
  { name: ROLES.AGENT_STAFF,      description: '대리점 직원',                          userType: USER_TYPES.AGENT    },
  { name: ROLES.MERCHANT_OWNER,   description: '가맹점 대표',                          userType: USER_TYPES.MERCHANT },
  { name: ROLES.MERCHANT_STAFF,   description: '가맹점 직원',                          userType: USER_TYPES.MERCHANT },
] as const;

// ---- 역할별 권한 매핑 ----
export const ROLE_PERMISSION_MAP: Readonly<Record<string, readonly string[]>> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.SETTLEMENT_ADMIN]: [
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.SETTLEMENT_CONFIRM,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.DEPOSIT_CREATE,
    PERMISSIONS.DEPOSIT_READ,
    PERMISSIONS.DEPOSIT_CONFIRM,
    PERMISSIONS.DEPOSIT_RECONCILE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.OPERATION_ADMIN]: [
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.AGENT_READ,
    PERMISSIONS.MERCHANT_CREATE,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.MERCHANT_UPDATE,
    PERMISSIONS.TRANSACTION_CREATE,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.TRANSACTION_CANCEL,
    PERMISSIONS.RISK_READ,
    PERMISSIONS.RISK_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.READ_ONLY_ADMIN]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.AGENT_READ,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.DEPOSIT_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.RISK_READ,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.AGENT_OWNER]: [
    PERMISSIONS.AGENT_READ,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.PG_WEBHOOK_MANAGE,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.AGENT_STAFF]: [
    PERMISSIONS.AGENT_READ,
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.PG_WEBHOOK_MANAGE,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.MERCHANT_OWNER]: [
    PERMISSIONS.MERCHANT_READ,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.SETTLEMENT_READ,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.PG_WEBHOOK_MANAGE,
    PERMISSIONS.DASHBOARD_READ,
  ],

  [ROLES.MERCHANT_STAFF]: [
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.PG_WEBHOOK_MANAGE,
    PERMISSIONS.DASHBOARD_READ,
  ],
};

// ---- 시스템 코드 정의 ----
export interface SystemCodeDef {
  readonly groupCode: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
}

export const SYSTEM_CODE_DEFS: readonly SystemCodeDef[] = [
  // 결제 수단
  { groupCode: 'PAYMENT_METHOD', code: 'CARD',            name: '신용카드',   sortOrder: 1 },
  { groupCode: 'PAYMENT_METHOD', code: 'CASH',            name: '현금',       sortOrder: 2 },
  { groupCode: 'PAYMENT_METHOD', code: 'TRANSFER',        name: '계좌이체',   sortOrder: 3 },
  { groupCode: 'PAYMENT_METHOD', code: 'VIRTUAL_ACCOUNT', name: '가상계좌',   sortOrder: 4 },
  { groupCode: 'PAYMENT_METHOD', code: 'EASY_PAY',        name: '간편결제',   sortOrder: 5 },

  // 정산 주기
  { groupCode: 'SETTLEMENT_CYCLE', code: 'D+1',     name: '익일 정산',   sortOrder: 1 },
  { groupCode: 'SETTLEMENT_CYCLE', code: 'D+2',     name: '2일 후 정산', sortOrder: 2 },
  { groupCode: 'SETTLEMENT_CYCLE', code: 'D+3',     name: '3일 후 정산', sortOrder: 3 },
  { groupCode: 'SETTLEMENT_CYCLE', code: 'WEEKLY',  name: '주 정산',     sortOrder: 4 },
  { groupCode: 'SETTLEMENT_CYCLE', code: 'MONTHLY', name: '월 정산',     sortOrder: 5 },

  // 거래 유형
  { groupCode: 'TRAN_TYPE', code: 'PAYMENT', name: '결제',     sortOrder: 1 },
  { groupCode: 'TRAN_TYPE', code: 'CANCEL',  name: '취소',     sortOrder: 2 },
  { groupCode: 'TRAN_TYPE', code: 'REFUND',  name: '환불',     sortOrder: 3 },
  { groupCode: 'TRAN_TYPE', code: 'PARTIAL', name: '부분취소', sortOrder: 4 },

  // 가맹점 상태
  { groupCode: 'MERCHANT_STATUS', code: 'PENDING',   name: '심사중',   sortOrder: 1 },
  { groupCode: 'MERCHANT_STATUS', code: 'ACTIVE',    name: '정상',     sortOrder: 2 },
  { groupCode: 'MERCHANT_STATUS', code: 'INACTIVE',  name: '비활성',   sortOrder: 3 },
  { groupCode: 'MERCHANT_STATUS', code: 'SUSPENDED', name: '정지',     sortOrder: 4 },

  // 카드사
  { groupCode: 'CARD_COMPANY', code: 'SHINHAN', name: '신한카드',   sortOrder: 1 },
  { groupCode: 'CARD_COMPANY', code: 'KB',      name: 'KB국민카드', sortOrder: 2 },
  { groupCode: 'CARD_COMPANY', code: 'HYUNDAI', name: '현대카드',   sortOrder: 3 },
  { groupCode: 'CARD_COMPANY', code: 'SAMSUNG', name: '삼성카드',   sortOrder: 4 },
  { groupCode: 'CARD_COMPANY', code: 'LOTTE',   name: '롯데카드',   sortOrder: 5 },
  { groupCode: 'CARD_COMPANY', code: 'BC',      name: 'BC카드',     sortOrder: 6 },
  { groupCode: 'CARD_COMPANY', code: 'HANA',    name: '하나카드',   sortOrder: 7 },
  { groupCode: 'CARD_COMPANY', code: 'WOORI',   name: '우리카드',   sortOrder: 8 },
  { groupCode: 'CARD_COMPANY', code: 'NH',      name: '농협카드',   sortOrder: 9 },
] as const;
