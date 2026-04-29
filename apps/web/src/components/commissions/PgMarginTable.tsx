"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDateOnly } from "@/lib/format";
import type { PgMargin } from "@/types/commission";

interface Props {
  margins: PgMargin[];
  isLoading: boolean;
}

export function PgMarginTable({ margins, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (margins.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-400">
        PG 마진 설정이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">결제수단</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">카드사</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">수수료율</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">최소수수료</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">적용시작</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">적용종료</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {margins.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{m.payment_method}</td>
              <td className="px-4 py-3 text-gray-900">
                {m.card_company ?? "공통"}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {Number(m.margin_rate).toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {m.min_fee.toLocaleString()}원
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {formatDateOnly(m.effective_from)}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {m.effective_to !== null ? formatDateOnly(m.effective_to) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
