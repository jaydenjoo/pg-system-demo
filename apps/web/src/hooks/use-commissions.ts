"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  PgMargin,
  AgentCommission,
  MerchantCommission,
  CommissionHistoryResponse,
  SetPgMarginForm,
  SetAgentCommissionForm,
  SetMerchantCommissionForm,
} from "@/types/commission";

export function usePgMargins() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<PgMargin[]>>(
    "/commissions/pg-margins",
    apiGet<PgMargin[]>,
  );
  return {
    margins: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useAgentCommissions(agentId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AgentCommission[]>
  >(
    agentId !== null ? `/commissions/agents/${agentId}` : null,
    apiGet<AgentCommission[]>,
  );
  return {
    commissions: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useMerchantCommissions(merchantId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<MerchantCommission[]>
  >(
    merchantId !== null ? `/commissions/merchants/${merchantId}` : null,
    apiGet<MerchantCommission[]>,
  );
  return {
    commissions: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCommissionHistory(
  entityType: string | null,
  entityId: string | null,
) {
  const key =
    entityType !== null && entityId !== null
      ? `/commissions/history/${entityType}/${entityId}`
      : null;
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<CommissionHistoryResponse>
  >(key, apiGet<CommissionHistoryResponse>);
  return {
    history: data?.data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useSetPgMargin() {
  const [isLoading, setIsLoading] = useState(false);

  const setPgMargin = async (form: SetPgMarginForm): Promise<PgMargin> => {
    setIsLoading(true);
    try {
      const res = await apiPost<PgMargin>("/commissions/pg-margins", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { setPgMargin, isLoading };
}

export function useSetAgentCommission(agentId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const setCommission = async (
    form: SetAgentCommissionForm,
  ): Promise<AgentCommission> => {
    setIsLoading(true);
    try {
      const res = await apiPost<AgentCommission>(
        `/commissions/agents/${agentId}`,
        form,
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { setCommission, isLoading };
}

export function useSetMerchantCommission(merchantId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const setCommission = async (
    form: SetMerchantCommissionForm,
  ): Promise<MerchantCommission> => {
    setIsLoading(true);
    try {
      const res = await apiPost<MerchantCommission>(
        `/commissions/merchants/${merchantId}`,
        form,
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { setCommission, isLoading };
}
