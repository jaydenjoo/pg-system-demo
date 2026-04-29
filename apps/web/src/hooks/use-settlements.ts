"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  Settlement,
  AgentSettlement,
  SettlementQuery,
  AgentSettlementQuery,
  CalculateSettlementForm,
} from "@/types/settlement";

function buildSettlementQS(query?: SettlementQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.merchantId) params.set("merchantId", query.merchantId);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.status) params.set("status", query.status);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const str = params.toString();
  return str ? `?${str}` : "";
}

function buildAgentSettlementQS(query?: AgentSettlementQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.status) params.set("status", query.status);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useSettlements(query?: SettlementQuery) {
  const qs = buildSettlementQS(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Settlement[]>
  >(`/settlements${qs}`, apiGet<Settlement[]>);
  return {
    settlements: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useSettlement(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Settlement>>(
    id !== null ? `/settlements/${id}` : null,
    apiGet<Settlement>,
  );
  return {
    settlement: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useAgentSettlements(query?: AgentSettlementQuery) {
  const qs = buildAgentSettlementQS(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AgentSettlement[]>
  >(`/settlements/agents${qs}`, apiGet<AgentSettlement[]>);
  return {
    settlements: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useAgentSettlement(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AgentSettlement>
  >(id !== null ? `/settlements/agents/${id}` : null, apiGet<AgentSettlement>);
  return {
    settlement: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

interface CalculateSettlementResult {
  merchantSettlements: number;
  agentSettlements: number;
}

export function useCalculateSettlement() {
  const [isLoading, setIsLoading] = useState(false);

  const calculateSettlement = async (
    form: CalculateSettlementForm,
  ): Promise<CalculateSettlementResult> => {
    setIsLoading(true);
    try {
      const res = await apiPost<CalculateSettlementResult>(
        "/settlements/calculate",
        form,
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { calculateSettlement, isLoading };
}

export function useConfirmSettlement(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const confirmSettlement = async (): Promise<Settlement> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Settlement>(`/settlements/${id}/confirm`, {});
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { confirmSettlement, isLoading };
}

export function useCompleteSettlement(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const completeSettlement = async (): Promise<Settlement> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Settlement>(`/settlements/${id}/complete`, {});
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { completeSettlement, isLoading };
}
