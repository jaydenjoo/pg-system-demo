"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useWebhookEvents, useResendWebhook } from "@/hooks/use-webhooks";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { WebhookEventsQuery, WebhookEvent } from "@/types/webhook";

const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "PENDING", label: "대기" },
  { value: "SENT", label: "성공" },
  { value: "FAILED", label: "실패" },
];

const STATUS_BADGE_MAP: Record<string, "warning" | "success" | "danger" | "default"> = {
  PENDING: "warning",
  SENT: "success",
  FAILED: "danger",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  PENDING: "대기",
  SENT: "성공",
  FAILED: "실패",
};

export function WebhookEventsTable() {
  const { toast } = useToast();
  const [query, setQuery] = useState<WebhookEventsQuery>({ limit: "20" });
  const { events, count, isLoading, mutate } = useWebhookEvents(query);
  const { resendWebhook, isLoading: resending } = useResendWebhook();
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleFilterChange = (key: keyof WebhookEventsQuery, value: string): void => {
    setQuery((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const handleResend = async (event: WebhookEvent): Promise<void> => {
    setResendingId(event.id);
    try {
      const result = await resendWebhook(event.id);
      if (result.success) {
        toast(result.message, "success");
        await mutate();
      } else {
        toast(result.message, "error");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "재발송 실패";
      toast(message, "error");
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={query.status ?? ""}
          onChange={(e) => handleFilterChange("status", e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={query.startDate ?? ""}
          onChange={(e) => handleFilterChange("startDate", e.target.value ? `${e.target.value}T00:00:00Z` : "")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400 text-sm">~</span>
        <input
          type="date"
          value={query.endDate?.split("T")[0] ?? ""}
          onChange={(e) => handleFilterChange("endDate", e.target.value ? `${e.target.value}T23:59:59Z` : "")}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <span className="text-sm text-gray-500 ml-auto">
          총 {count.toLocaleString()}건
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                이벤트 타입
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                상태
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                재시도
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                응답코드
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                발송시간
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                액션
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-8 bg-gray-200 rounded-md animate-pulse" />
                  </td>
                </tr>
              ))
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  웹훅 이벤트가 없습니다.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {event.event_type}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE_MAP[event.status] ?? "default"}>
                      {STATUS_LABEL_MAP[event.status] ?? event.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    {event.retry_count}회
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    {event.response_status ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {event.sent_at ? formatDate(event.sent_at) : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {event.status === "FAILED" && (
                      <button
                        onClick={() => handleResend(event)}
                        disabled={resending && resendingId === event.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${resending && resendingId === event.id ? "animate-spin" : ""}`} />
                        재발송
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
