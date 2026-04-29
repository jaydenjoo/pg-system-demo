/** 감사 로그 (audit_logs) */
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** 위험 알림 (risk_alerts) */
export interface RiskAlert {
  id: string;
  alert_type: string;
  severity: string;
  merchant_id: string | null;
  transaction_id: string | null;
  description: string;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

/** 로그인 이력 (login_history) */
export interface LoginHistory {
  id: string;
  user_id: string;
  login_result: string;
  ip_address: string;
  user_agent: string | null;
  mfa_type: string | null;
  created_at: string;
}

/** 감사 로그 조회 쿼리 */
export interface AuditLogQuery {
  page?: number | undefined;
  limit?: number | undefined;
  userId?: string | undefined;
  action?: string | undefined;
  resourceType?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

/** 위험 알림 조회 쿼리 */
export interface RiskAlertQuery {
  page?: number | undefined;
  limit?: number | undefined;
  severity?: string | undefined;
  resolved?: boolean | undefined;
}

/** 로그인 이력 조회 쿼리 */
export interface LoginHistoryQuery {
  page?: number | undefined;
  limit?: number | undefined;
  userId?: string | undefined;
  result?: string | undefined;
}
