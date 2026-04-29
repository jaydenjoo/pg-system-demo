"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  Merchant,
  CreateMerchantForm,
  UpdateMerchantForm,
  ChangeMerchantStatusForm,
  MerchantQuery,
} from "@/types/merchant";

function buildQueryString(query?: MerchantQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.status) params.set("status", query.status);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useMerchants(query?: MerchantQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Merchant[]>
  >(`/merchants${qs}`, apiGet<Merchant[]>);
  return {
    merchants: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useMerchant(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Merchant>>(
    id !== null ? `/merchants/${id}` : null,
    apiGet<Merchant>,
  );
  return {
    merchant: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateMerchant() {
  const [isLoading, setIsLoading] = useState(false);

  const createMerchant = async (form: CreateMerchantForm): Promise<Merchant> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Merchant>("/merchants", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createMerchant, isLoading };
}

export function useUpdateMerchant(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const updateMerchant = async (form: UpdateMerchantForm): Promise<Merchant> => {
    setIsLoading(true);
    try {
      const res = await apiPut<Merchant>(`/merchants/${id}`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateMerchant, isLoading };
}

export function useDeleteMerchant() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteMerchant = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/merchants/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteMerchant, isLoading };
}

export function useChangeMerchantStatus(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const changeStatus = async (form: ChangeMerchantStatusForm): Promise<Merchant> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Merchant>(`/merchants/${id}/status`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { changeStatus, isLoading };
}
