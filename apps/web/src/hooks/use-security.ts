"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  AuditLog,
  AuditLogQuery,
  RiskAlert,
  RiskAlertQuery,
  LoginHistory,
  LoginHistoryQuery,
} from "@/types/security";

function buildAuditLogQuery(query?: AuditLogQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.userId) params.set("userId", query.userId);
  if (query.action) params.set("action", query.action);
  if (query.resourceType) params.set("resourceType", query.resourceType);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const str = params.toString();
  return str ? `?${str}` : "";
}

function buildRiskAlertQuery(query?: RiskAlertQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.severity) params.set("severity", query.severity);
  if (query.resolved !== undefined)
    params.set("resolved", String(query.resolved));
  const str = params.toString();
  return str ? `?${str}` : "";
}

/** 감사 로그 목록 조회 */
export function useAuditLogs(query?: AuditLogQuery) {
  const qs = buildAuditLogQuery(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AuditLog[]>
  >(`/security/audit-logs${qs}`, apiGet<AuditLog[]>);
  return {
    logs: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 위험 알림 목록 조회 */
export function useRiskAlerts(query?: RiskAlertQuery) {
  const qs = buildRiskAlertQuery(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<RiskAlert[]>
  >(`/security/risk-alerts${qs}`, apiGet<RiskAlert[]>);
  return {
    alerts: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 위험 알림 해결 처리 */
export function useResolveRiskAlert() {
  const [isLoading, setIsLoading] = useState(false);

  const resolve = async (alertId: string): Promise<RiskAlert> => {
    setIsLoading(true);
    try {
      const res = await apiPost<RiskAlert>(
        `/security/risk-alerts/${alertId}/resolve`,
        {},
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { resolve, isLoading };
}

function buildLoginHistoryQuery(query?: LoginHistoryQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.userId) params.set("userId", query.userId);
  if (query.result) params.set("result", query.result);
  const str = params.toString();
  return str ? `?${str}` : "";
}

/** 로그인 이력 조회 */
export function useLoginHistory(query?: LoginHistoryQuery) {
  const qs = buildLoginHistoryQuery(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<LoginHistory[]>
  >(`/security/login-history${qs}`, apiGet<LoginHistory[]>);
  return {
    history: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}
