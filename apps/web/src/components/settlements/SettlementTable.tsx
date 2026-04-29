"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatDateOnly } from "@/lib/format";
import type { Settlement, SettlementStatus } from "@/types/settlement";

const STATUS_LABELS: Record<SettlementStatus, string> = {
  CALCULATED: "산출",
  CONFIRMED: "확정",
  REMITTED: "송금",
  COMPLETED: "완료",
};

const STATUS_VARIANTS: Record<SettlementStatus, "default" | "success" | "warning" | "danger" | "secondary"> = {
  CALCULATED: "warning",
  CONFIRMED: "secondary",
  REMITTED: "default",
  COMPLETED: "success",
};

interface Props {
  settlements: Settlement[];
  isLoading: boolean;
  onRefresh: () => void;
  /** 가맹점명 컬럼 숨김 (가맹점 포탈용) */
  hideMerchantColumn?: boolean;
  /** 상세 페이지 기본 경로 (기본값: /settlements) */
  detailBasePath?: string;
}

export function SettlementTable({
  settlements,
  isLoading,
  hideMerchantColumn = false,
  detailBasePath = "/settlements",
}: Props) {
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

  if (settlements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
        정산 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {!hideMerchantColumn && (
              <th className="px-4 py-3 text-left font-medium text-gray-600">가맹점</th>
            )}
            <th className="px-4 py-3 text-left font-medium text-gray-600">정산기간</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">거래금액</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">수수료</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">지급금액</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">상태</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">정산일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {settlements.map((stl) => (
            <tr
              key={stl.id}
              onClick={() => router.push(`${detailBasePath}/${stl.id}`)}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {!hideMerchantColumn && (
                <td className="px-4 py-3 text-gray-900">
                  {stl.merchants?.merchant_name ?? "-"}
                </td>
              )}
              <td className="px-4 py-3 text-gray-600 text-xs">
                {formatDateOnly(stl.period_from)} ~ {formatDateOnly(stl.period_to)}
              </td>
              <td className="px-4 py-3 text-right text-gray-900">
                {formatAmount(stl.total_amount)}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatAmount(stl.total_fee)}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatAmount(stl.payout_amount)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANTS[stl.status]}>
                  {STATUS_LABELS[stl.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {formatDateOnly(stl.settlement_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
