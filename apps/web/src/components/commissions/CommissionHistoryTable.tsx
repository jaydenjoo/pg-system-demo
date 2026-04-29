"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateOnly } from "@/lib/format";
import type { CommissionRecord } from "@/types/commission";

interface Props {
  history: CommissionRecord[];
  isLoading: boolean;
}

export function CommissionHistoryTable({ history, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
        수수료 변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">결제수단</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">카드사</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">수수료율</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">적용기간</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">변경일시</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {history.map((h) => (
            <tr key={h.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700">{h.payment_method}</td>
              <td className="px-4 py-2 text-gray-700">
                {h.card_company ?? "공통"}
              </td>
              <td className="px-4 py-2 text-right font-medium text-gray-900">
                {Number(h.commission_rate).toFixed(2)}%
              </td>
              <td className="px-4 py-2 text-gray-500 text-xs">
                {formatDateOnly(h.effective_from)}
                {h.effective_to !== null
                  ? ` ~ ${formatDateOnly(h.effective_to)}`
                  : " ~"}
              </td>
              <td className="px-4 py-2 text-gray-400 text-xs">
                {formatDate(h.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
