'use client';

import useSWR from 'swr';
import { apiGet } from '@/lib/api-client';
import type {
  DashboardSummary,
  TransactionStatsResponse,
  SettlementStat,
  DailyTrend,
  TopMerchant,
  TopAgent,
  DashboardQuery,
} from '@/types/dashboard';
import type { ApiResponse } from '@/types/api';

function buildQueryString(query?: DashboardQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.startDate) params.set('startDate', query.startDate);
  if (query.endDate) params.set('endDate', query.endDate);
  if (query.merchantId) params.set('merchantId', query.merchantId);
  if (query.agentId) params.set('agentId', query.agentId);
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function useDashboardSummary(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<DashboardSummary>>(
    `/dashboard/summary${qs}`,
    apiGet<DashboardSummary>,
  );
  return {
    summary: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
  };
}

export function useTransactionStats(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<TransactionStatsResponse>>(
    `/dashboard/transaction-stats${qs}`,
    apiGet<TransactionStatsResponse>,
  );
  return {
    stats: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
  };
}

export function useSettlementStats(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<SettlementStat[]>>(
    `/dashboard/settlement-stats${qs}`,
    apiGet<SettlementStat[]>,
  );
  return {
    stats: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
  };
}

export function useDailyTrend(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<DailyTrend[]>>(
    `/dashboard/daily-trend${qs}`,
    apiGet<DailyTrend[]>,
  );
  return {
    trend: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
  };
}

export function useTopMerchants(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<TopMerchant[]>>(
    `/dashboard/top-merchants${qs}`,
    apiGet<TopMerchant[]>,
  );
  return {
    merchants: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
  };
}

export function useTopAgents(query?: DashboardQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading } = useSWR<ApiResponse<TopAgent[]>>(
    `/dashboard/top-agents${qs}`,
    apiGet<TopAgent[]>,
  );
  return {
    agents: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
  };
}
