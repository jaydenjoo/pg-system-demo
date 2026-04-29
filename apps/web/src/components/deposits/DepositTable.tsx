"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatDateOnly } from "@/lib/format";
import type { Deposit, ReconcileStatus } from "@/types/deposit";

const STATUS_LABELS: Record<ReconcileStatus, string> = {
  PENDING: "대기",
  MATCHED: "매칭완료",
  MISMATCHED: "불일치",
  MANUAL: "수동처리",
};

const STATUS_VARIANTS: Record<ReconcileStatus, "success" | "warning" | "danger"> = {
  PENDING: "warning",
  MATCHED: "success",
  MISMATCHED: "danger",
  MANUAL: "warning",
};

interface Props {
  deposits: Deposit[];
  isLoading: boolean;
}

export function DepositTable({ deposits, isLoading }: Props) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (deposits.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
        입금 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">입금일</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">입금출처</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">입금금액</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">매칭금액</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">미매칭</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">대사상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {deposits.map((dep) => (
            <tr
              key={dep.id}
              onClick={() => router.push(`/deposits/${dep.id}`)}
              className="cursor-pointer transition-colors hover:bg-gray-50"
            >
              <td className="px-4 py-3 text-gray-600 text-xs">
                {formatDateOnly(dep.deposit_date)}
              </td>
              <td className="px-4 py-3 text-gray-900">{dep.source}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatAmount(dep.amount)}
              </td>
              <td className="px-4 py-3 text-right text-green-700">
                {formatAmount(dep.matched_amount)}
              </td>
              <td className="px-4 py-3 text-right text-red-600">
                {formatAmount(dep.unmatched_amount)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANTS[dep.reconcile_status]}>
                  {STATUS_LABELS[dep.reconcile_status]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
