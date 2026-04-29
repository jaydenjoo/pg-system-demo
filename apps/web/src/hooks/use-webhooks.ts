"use client";

import useSWR from "swr";
import { useState } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import type { ApiResponse } from "@/types/api";
import type {
  WebhookConfig,
  WebhookEventsResponse,
  WebhookEventsQuery,
  WebhookTestResult,
  WebhookResendResult,
  UpdateWebhookConfigForm,
} from "@/types/webhook";

function buildEventsQueryString(query?: WebhookEventsQuery): string {
  if (query === undefined) return "";
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  if (query.limit) params.set("limit", query.limit);
  const str = params.toString();
  return str ? `?${str}` : "";
}

/** 웹훅 설정 조회 (GET /webhooks/config) */
export function useWebhookConfig() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<WebhookConfig>>(
    "/webhooks/config",
    apiGet<WebhookConfig>,
  );
  return {
    config: data?.data ?? null,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 웹훅 이벤트 이력 조회 (GET /webhooks/events) */
export function useWebhookEvents(query?: WebhookEventsQuery) {
  const qs = buildEventsQueryString(query);
  const { data, error, isLoading, mutate } = useSWR<ApiResponse<WebhookEventsResponse>>(
    `/webhooks/events${qs}`,
    apiGet<WebhookEventsResponse>,
  );
  return {
    events: data?.data?.events ?? [],
    count: data?.data?.count ?? 0,
    isLoading,
    isError: error !== undefined && error !== null,
    mutate,
  };
}

/** 웹훅 설정 업데이트 (PUT /webhooks/config) */
export function useUpdateWebhookConfig() {
  const [isLoading, setIsLoading] = useState(false);

  const updateConfig = async (
    form: UpdateWebhookConfigForm,
  ): Promise<{ webhookUrl: string; message: string }> => {
    setIsLoading(true);
    try {
      const res = await apiPut<{ webhookUrl: string; message: string }>(
        "/webhooks/config",
        form,
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateConfig, isLoading };
}

/** 웹훅 테스트 발송 (POST /webhooks/test) */
export function useTestWebhook() {
  const [isLoading, setIsLoading] = useState(false);

  const testWebhook = async (): Promise<WebhookTestResult> => {
    setIsLoading(true);
    try {
      const res = await apiPost<WebhookTestResult>("/webhooks/test", {});
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { testWebhook, isLoading };
}

/** 웹훅 수동 재발송 (POST /webhooks/events/:id/resend) */
export function useResendWebhook() {
  const [isLoading, setIsLoading] = useState(false);

  const resendWebhook = async (webhookId: string): Promise<WebhookResendResult> => {
    setIsLoading(true);
    try {
      const res = await apiPost<WebhookResendResult>(
        `/webhooks/events/${webhookId}/resend`,
        {},
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  return { resendWebhook, isLoading };
}
