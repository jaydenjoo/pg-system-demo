"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  Transaction,
  TransactionQuery,
  CreateTransactionForm,
  CancelTransactionForm,
} from "@/types/transaction";

function buildQueryString(query?: TransactionQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.merchantId) params.set("merchantId", query.merchantId);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.status) params.set("status", query.status);
  if (query.paymentMethod) params.set("paymentMethod", query.paymentMethod);
  if (query.tranType) params.set("tranType", query.tranType);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useTransactions(query?: TransactionQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Transaction[]>
  >(`/transactions${qs}`, apiGet<Transaction[]>);
  return {
    transactions: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useTransaction(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Transaction>>(
    id !== null ? `/transactions/${id}` : null,
    apiGet<Transaction>,
  );
  return {
    transaction: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateTransaction() {
  const [isLoading, setIsLoading] = useState(false);

  const createTransaction = async (
    form: CreateTransactionForm,
  ): Promise<Transaction> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Transaction>("/transactions", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createTransaction, isLoading };
}

export function useCancelTransaction(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const cancelTransaction = async (
    form: CancelTransactionForm,
  ): Promise<Transaction> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Transaction>(`/transactions/${id}/cancel`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { cancelTransaction, isLoading };
}
