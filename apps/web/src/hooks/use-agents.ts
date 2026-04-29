"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  Agent,
  SubAgent,
  CreateAgentForm,
  UpdateAgentForm,
  ChangeAgentStatusForm,
  AgentQuery,
} from "@/types/agent";

function buildQueryString(query?: AgentQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.parentAgentId) params.set("parentAgentId", query.parentAgentId);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useAgents(query?: AgentQuery) {
  const qs = buildQueryString(query);
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<Agent[]>
  >(`/agents${qs}`, apiGet<Agent[]>);
  return {
    agents: data?.data ?? [],
    meta: data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useAgent(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<Agent>>(
    id !== null ? `/agents/${id}` : null,
    apiGet<Agent>,
  );
  return {
    agent: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useSubAgents(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<SubAgent[]>>(
    id !== null ? `/agents/${id}/sub-agents` : null,
    apiGet<SubAgent[]>,
  );
  return {
    subAgents: data?.data ?? [],
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

export function useCreateAgent() {
  const [isLoading, setIsLoading] = useState(false);

  const createAgent = async (form: CreateAgentForm): Promise<Agent> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Agent>("/agents", form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { createAgent, isLoading };
}

export function useUpdateAgent(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const updateAgent = async (form: UpdateAgentForm): Promise<Agent> => {
    setIsLoading(true);
    try {
      const res = await apiPut<Agent>(`/agents/${id}`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateAgent, isLoading };
}

export function useDeleteAgent() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteAgent = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiDelete(`/agents/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteAgent, isLoading };
}

export function useChangeAgentStatus(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const changeStatus = async (form: ChangeAgentStatusForm): Promise<Agent> => {
    setIsLoading(true);
    try {
      const res = await apiPost<Agent>(`/agents/${id}/status`, form);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { changeStatus, isLoading };
}
