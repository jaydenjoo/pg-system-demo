"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatDateOnly } from "@/lib/format";
import type { AgentSettlement, SettlementStatus } from "@/types/settlement";

const STATUS_LABELS: Record<SettlementStatus, string> = {
  CALCULATED: "산출",
  CONFIRMED: "확정",
  REMITTED: "송금",
  COMPLETED: "완료",
};

const STATUS_VARIANTS: Record<SettlementStatus, "default" | "success" | "warning" | "secondary"> = {
  CALCULATED: "warning",
  CONFIRMED: "secondary",
  REMITTED: "default",
  COMPLETED: "success",
};

interface Props {
  settlements: AgentSettlement[];
  isLoading: boolean;
}

export function AgentSettlementTable({ settlements, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (settlements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
        대리점 정산 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">대리점</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">정산기간</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">수수료</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">거래건수</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {settlements.map((stl) => (
            <tr key={stl.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-900">
                {stl.agents?.agent_name ?? "-"}
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs">
                {formatDateOnly(stl.period_from)} ~ {formatDateOnly(stl.period_to)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatAmount(stl.total_commission)}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {stl.tran_count.toLocaleString()}건
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANTS[stl.status]}>
                  {STATUS_LABELS[stl.status]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
