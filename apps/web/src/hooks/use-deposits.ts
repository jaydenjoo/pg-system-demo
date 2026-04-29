"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  Deposit,
  DepositQuery,
  CreateDepositForm,
  ManualMatchForm,
  MatchedTransaction,
} from "@/types/deposit";

function buildQS(query?: DepositQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.source) params.set("source", query.source);
  if (query.reconcileStatus)
    params.set("reconcileStatus", query.reconcileStatus);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useDeposits(query?: DepositQuery) {
  const qs = buildQS(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Deposit[]>
  >(`/deposits${qs}`, apiGet<Deposit[]>);
  return {
    deposits: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useDeposit(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Deposit>>(
    id !== null ? `/deposits/${id}` : null,
    apiGet<Deposit>,
  );
  return {
    deposit: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateDeposit() {
  const [isLoading, setIsLoading] = useState(false);

  const createDeposit = async (form: CreateDepositForm): Promise<Deposit> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Deposit>("/deposits", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createDeposit, isLoading };
}

export function useReconcile(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const reconcile = async (): Promise<Deposit> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Deposit>(`/deposits/${id}/reconcile`, {});
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { reconcile, isLoading };
}

export function useManualMatch(depositId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const manualMatch = async (
    form: ManualMatchForm,
  ): Promise<MatchedTransaction> => {
    setIsLoading(true);
    try {
      const res = await apiPost<MatchedTransaction>(
        `/deposits/${depositId}/match`,
        form,
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { manualMatch, isLoading };
}

export function useUnmatch(depositId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const unmatch = async (matchId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/deposits/${depositId}/matches/${matchId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { unmatch, isLoading };
}
